import * as FileSystem from "expo-file-system/legacy";
import {
  runtimeModelManifest,
  toModelDownloadConfig,
  type RuntimeModelFile,
  type RuntimeModelVersion,
} from "@/utils/modelManifest";
import { Buffer } from "buffer";
import { sha256 } from "js-sha256";
import { AppState } from "react-native";

const LOG_PREFIX = "[CoreMLModelManager]";
const DEFAULT_RETRY_COUNT = 3;
const DOWNLOAD_ATTEMPT_TIMEOUT_MS = 90_000;
const INSTALL_METADATA_FILE = "install-metadata.json";
const MANAGER_STATE_FILE = "manager-state.json";

type DownloadFileDescriptor = {
  path: string;
  expectedHash: string;
  sources: string[];
};

export type ModelAssetProgressStage =
  | "preparing"
  | "downloading"
  | "verifying"
  | "activating"
  | "ready";

export type ModelAssetProgressEvent = {
  stage: ModelAssetProgressStage;
  message: string;
  progress: number;
  filePath?: string;
  bytesProcessed?: number;
  totalBytes?: number;
};

type ModelAssetProgressCallback = (event: ModelAssetProgressEvent) => void;

export type ModelAssetDownloadTelemetry = {
  modelName: string;
  durationMs: number;
  attempts: number;
  bytesWritten: number;
  source: string;
};

export type ModelAssetReadyResult = {
  modelDirectory: string;
  modelPath: string;
  downloaded: boolean;
  activeVersionId: string;
  telemetry?: ModelAssetDownloadTelemetry;
};

type InstalledFileMetadata = {
  path: string;
  expectedHash: string;
};

type InstalledModelMetadata = {
  versionId: string;
  manifestVersion: number;
  modelName: string;
  modelRelativePath: string;
  installedAt: string;
  files: InstalledFileMetadata[];
};

type ManagerState = {
  activeVersionId?: string;
  activeModelPath?: string;
  manifestVersion?: number;
  activatedAt?: string;
};

let ensureModelPromise: Promise<ModelAssetReadyResult | null> | null = null;

function logProgressListenerError(error: unknown): void {
  console.warn(`${LOG_PREFIX} progress listener callback failed`, {
    error: error instanceof Error ? error.message : String(error),
  });
}

class ProgressEmitter<T> {
  private listeners = new Set<(event: T) => void>();
  private lastEvent: T | null = null;

  emit(event: T): void {
    this.lastEvent = event;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logProgressListenerError(error);
      }
    }
  }

  subscribe(listener: (event: T) => void): () => void {
    this.listeners.add(listener);

    if (this.lastEvent) {
      try {
        listener(this.lastEvent);
      } catch (error) {
        logProgressListenerError(error);
      }
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.listeners.clear();
    this.lastEvent = null;
  }
}

const ensureModelProgressEmitter =
  new ProgressEmitter<ModelAssetProgressEvent>();

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function normalizeDirectory(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function getModelsRootDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error(
      "FileSystem.documentDirectory is unavailable; persistent model storage cannot be initialized.",
    );
  }

  return `${normalizeDirectory(FileSystem.documentDirectory)}coreml-models/`;
}

function getModelDirectory(versionId: string): string {
  return `${getModelsRootDirectory()}${versionId}/`;
}

function getModelFilePath(versionId: string, relativePath: string): string {
  return `${getModelDirectory(versionId)}${relativePath}`;
}

function getInstallMetadataPath(versionId: string): string {
  return `${getModelDirectory(versionId)}${INSTALL_METADATA_FILE}`;
}

function getManagerStatePath(): string {
  return `${getModelsRootDirectory()}${MANAGER_STATE_FILE}`;
}

async function ensureDirectory(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value, null, 2));
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return null;
  }

  const content = await FileSystem.readAsStringAsync(path);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn(`${LOG_PREFIX} invalid JSON file; ignoring`, {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function hashFileSha256(
  path: string,
  onProgress?: (hashedBytes: number, totalBytes: number) => void,
): Promise<string> {
  const chunkSize = 1024 * 1024;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || typeof info.size !== "number") {
    throw new Error(`Unable to hash missing file: ${path}`);
  }

  const hasher = sha256.create();
  let hashedBytes = 0;

  for (let position = 0; position < info.size; position += chunkSize) {
    const length = Math.min(chunkSize, info.size - position);
    const chunk = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    hasher.update(Buffer.from(chunk, "base64"));
    hashedBytes += length;
    onProgress?.(hashedBytes, info.size);
  }

  return hasher.hex();
}

async function validateFileHash(
  path: string,
  expectedHash: string,
  onProgress?: (hashedBytes: number, totalBytes: number) => void,
): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.size === 0) {
    return false;
  }

  const digest = await hashFileSha256(path, onProgress);
  return digest.toLowerCase() === expectedHash.toLowerCase();
}

async function deleteIfExists(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

function toDownloadDescriptors(
  files: RuntimeModelFile[],
): DownloadFileDescriptor[] {
  return files.map((file) => ({
    path: file.path,
    expectedHash: file.sha256,
    sources: [...file.sources],
  }));
}

type DownloadResult = {
  bytesWritten: number;
  attempts: number;
  source: string;
};

type InactivityTimeoutRunOptions<T> = {
  timeoutMs: number;
  timeoutMessage: string;
  operation: (markActivity: () => void) => Promise<T>;
  onTimeout: () => Promise<unknown>;
  onForegroundRequired?: () => void;
  getCurrentAppState?: () => string;
  subscribeToAppState?: (listener: (state: string) => void) => {
    remove: () => void;
  };
};

async function runWithInactivityTimeout<T>({
  timeoutMs,
  timeoutMessage,
  operation,
  onTimeout,
  onForegroundRequired,
  getCurrentAppState = () => AppState.currentState,
  subscribeToAppState = (listener) =>
    AppState.addEventListener("change", listener),
}: InactivityTimeoutRunOptions<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let foregroundRequiredNotified = false;
    const appStateSubscription = subscribeToAppState((nextState) => {
      if (settled) {
        return;
      }

      if (nextState === "active") {
        foregroundRequiredNotified = false;
        scheduleTimeout();
        return;
      }

      clearTimer();
      if (!foregroundRequiredNotified) {
        foregroundRequiredNotified = true;
        onForegroundRequired?.();
      }
    });

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimer();
      appStateSubscription.remove();
      fn();
    };

    const scheduleTimeout = () => {
      if (getCurrentAppState() !== "active") {
        clearTimer();
        if (!foregroundRequiredNotified) {
          foregroundRequiredNotified = true;
          onForegroundRequired?.();
        }
        return;
      }

      clearTimer();
      timeoutId = setTimeout(() => {
        settle(() => {
          void onTimeout()
            .catch(() => undefined)
            .finally(() => {
              reject(new Error(timeoutMessage));
            });
        });
      }, timeoutMs);
    };

    const markActivity = () => {
      if (!settled) {
        scheduleTimeout();
      }
    };

    scheduleTimeout();

    void operation(markActivity)
      .then((result) => {
        settle(() => {
          resolve(result);
        });
      })
      .catch((error) => {
        settle(() => {
          reject(error);
        });
      });
  });
}

export const __coreMLModelManagerTestUtils = {
  runWithInactivityTimeout,
};

async function downloadResumableWithStallTimeout(
  source: string,
  destination: string,
  descriptorPath: string,
  onProgress?: (writtenBytes: number, expectedBytes: number) => void,
): Promise<{
  response: Awaited<ReturnType<FileSystem.DownloadResumable["downloadAsync"]>>;
  bytesWritten: number;
}> {
  let bytesWritten = 0;
  let resumable: FileSystem.DownloadResumable | null = null;
  let didEmitForegroundRequired = false;

  const response = await runWithInactivityTimeout<
    Awaited<ReturnType<FileSystem.DownloadResumable["downloadAsync"]>>
  >({
    timeoutMs: DOWNLOAD_ATTEMPT_TIMEOUT_MS,
    timeoutMessage: `Download stalled for ${descriptorPath} after ${DOWNLOAD_ATTEMPT_TIMEOUT_MS}ms`,
    operation: async (markActivity) => {
      resumable = FileSystem.createDownloadResumable(
        source,
        destination,
        {},
        (progress) => {
          bytesWritten = progress.totalBytesWritten;
          markActivity();
          onProgress?.(
            progress.totalBytesWritten,
            progress.totalBytesExpectedToWrite,
          );
        },
      );

      return resumable.downloadAsync();
    },
    onTimeout: async () => {
      await resumable?.pauseAsync();
    },
    onForegroundRequired: () => {
      if (didEmitForegroundRequired) {
        return;
      }

      didEmitForegroundRequired = true;
      const message = `App is in background. Bring the app to foreground to resume real-time progress updates for ${descriptorPath}.`;
      console.info(`${LOG_PREFIX} ${message}`);
      ensureModelProgressEmitter.emit({
        stage: "downloading",
        message,
        progress: 0,
        filePath: descriptorPath,
      });
    },
  });

  if (!resumable) {
    throw new Error(`Download could not be initialized for ${descriptorPath}`);
  }

  return { response, bytesWritten };
}

async function resolveBytesWritten(
  currentBytes: number,
  destination: string,
): Promise<number> {
  if (currentBytes > 0) {
    return currentBytes;
  }

  const fileInfo = await FileSystem.getInfoAsync(destination);
  return typeof fileInfo.size === "number" ? fileInfo.size : 0;
}

async function downloadWithFallbackSources(
  descriptor: DownloadFileDescriptor,
  destination: string,
  retries: number,
  onProgress?: (writtenBytes: number, expectedBytes: number) => void,
): Promise<DownloadResult> {
  let attemptCount = 0;
  let lastError: unknown = null;

  for (const source of descriptor.sources) {
    let attempt = 0;
    while (attempt < retries) {
      attempt += 1;
      attemptCount += 1;

      try {
        const { response, bytesWritten } =
          await downloadResumableWithStallTimeout(
            source,
            destination,
            descriptor.path,
            onProgress,
          );

        if (!response || response.status !== 200) {
          throw new Error(
            `Download failed for ${descriptor.path} with status ${response?.status ?? "unknown"}`,
          );
        }

        const finalBytesWritten = await resolveBytesWritten(
          bytesWritten,
          destination,
        );

        return {
          bytesWritten: finalBytesWritten,
          attempts: attemptCount,
          source,
        };
      } catch (error) {
        lastError = error;
        console.warn(`${LOG_PREFIX} download attempt failed`, {
          file: descriptor.path,
          source,
          attempt,
          retries,
          totalAttempts: attemptCount,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }
  }

  throw (
    lastError ??
    new Error(
      `Failed to download ${descriptor.path} from all configured sources: ${descriptor.sources.join(", ")}`,
    )
  );
}

function toInstalledModelMetadata(
  version: RuntimeModelVersion,
): InstalledModelMetadata {
  return {
    versionId: version.id,
    manifestVersion: runtimeModelManifest.manifestVersion,
    modelName: version.modelName,
    modelRelativePath: version.modelRelativePath,
    installedAt: new Date().toISOString(),
    files: version.files.map((file) => ({
      path: file.path,
      expectedHash: file.sha256,
    })),
  };
}

async function verifyInstalledVersion(
  version: RuntimeModelVersion,
): Promise<boolean> {
  const metadata = await readJsonFile<InstalledModelMetadata>(
    getInstallMetadataPath(version.id),
  );

  if (!metadata) {
    return false;
  }

  if (
    metadata.versionId !== version.id ||
    metadata.manifestVersion !== runtimeModelManifest.manifestVersion
  ) {
    return false;
  }

  for (const file of version.files) {
    const absolutePath = getModelFilePath(version.id, file.path);
    const fileValid = await validateFileHash(absolutePath, file.sha256);
    if (!fileValid) {
      return false;
    }
  }

  return true;
}

async function ensureFileDownloaded(
  version: RuntimeModelVersion,
  descriptor: DownloadFileDescriptor,
  onProgress?: (writtenBytes: number, expectedBytes: number) => void,
  onVerificationProgress?: (hashedBytes: number, totalBytes: number) => void,
): Promise<{
  downloaded: boolean;
  bytesWritten: number;
  attempts: number;
  source: string;
}> {
  const targetPath = getModelFilePath(version.id, descriptor.path);
  const targetDir = `${targetPath.split("/").slice(0, -1).join("/")}/`;
  await ensureDirectory(targetDir);

  const validExisting = await validateFileHash(
    targetPath,
    descriptor.expectedHash,
    onVerificationProgress,
  );
  if (validExisting) {
    return { downloaded: false, bytesWritten: 0, attempts: 0, source: "cache" };
  }

  await deleteIfExists(targetPath);
  const downloadResult = await downloadWithFallbackSources(
    descriptor,
    targetPath,
    version.retries ?? DEFAULT_RETRY_COUNT,
    onProgress,
  );

  const validDownloaded = await validateFileHash(
    targetPath,
    descriptor.expectedHash,
    onVerificationProgress,
  );
  if (!validDownloaded) {
    await deleteIfExists(targetPath);
    throw new Error(
      `Hash mismatch for ${descriptor.path}; integrity check failed.`,
    );
  }

  return {
    downloaded: true,
    bytesWritten: downloadResult.bytesWritten,
    attempts: downloadResult.attempts,
    source: downloadResult.source,
  };
}

async function writeManagerState(state: ManagerState): Promise<void> {
  await ensureDirectory(getModelsRootDirectory());
  await writeJsonFile(getManagerStatePath(), state);
}

async function readManagerState(): Promise<ManagerState | null> {
  return readJsonFile<ManagerState>(getManagerStatePath());
}

async function activateVersion(version: RuntimeModelVersion): Promise<string> {
  const modelPath = getModelFilePath(version.id, version.modelRelativePath);
  const modelInfo = await FileSystem.getInfoAsync(modelPath);
  if (!modelInfo.exists) {
    throw new Error(`Model path missing for activation: ${modelPath}`);
  }

  await writeManagerState({
    activeVersionId: version.id,
    activeModelPath: modelPath,
    manifestVersion: runtimeModelManifest.manifestVersion,
    activatedAt: new Date().toISOString(),
  });

  return modelPath;
}

async function cleanupOldVersions(
  keepVersionIds: string[],
  maxRetained: number,
): Promise<void> {
  const root = getModelsRootDirectory();
  const entries = await FileSystem.readDirectoryAsync(root).catch(
    () => [] as string[],
  );
  const keepSet = new Set(keepVersionIds);
  const candidateIds = entries.filter(
    (entry) => entry !== MANAGER_STATE_FILE && !keepSet.has(entry),
  );

  if (candidateIds.length === 0) {
    return;
  }

  const candidatesWithTime: { versionId: string; installedAtMs: number }[] = [];

  for (const versionId of candidateIds) {
    const metadata = await readJsonFile<InstalledModelMetadata>(
      getInstallMetadataPath(versionId),
    );
    const installedAtMs = metadata?.installedAt
      ? Date.parse(metadata.installedAt)
      : Number.NEGATIVE_INFINITY;
    candidatesWithTime.push({ versionId, installedAtMs });
  }

  candidatesWithTime.sort((a, b) => b.installedAtMs - a.installedAtMs);

  const versionsToKeep = candidatesWithTime.slice(
    0,
    Math.max(0, maxRetained - keepSet.size),
  );
  for (const retained of versionsToKeep) {
    keepSet.add(retained.versionId);
  }

  for (const versionId of candidateIds) {
    if (!keepSet.has(versionId)) {
      await deleteIfExists(getModelDirectory(versionId));
      console.info(`${LOG_PREFIX} cleaned up stale model version`, {
        versionId,
      });
    }
  }
}

async function prepareVersion(
  version: RuntimeModelVersion,
  onProgress?: ModelAssetProgressCallback,
): Promise<ModelAssetReadyResult> {
  const startedAt = Date.now();
  let bytesWritten = 0;
  let totalAttempts = 0;
  const downloadSources = new Set<string>();
  let downloadedAny = false;

  await ensureDirectory(getModelsRootDirectory());
  await ensureDirectory(getModelDirectory(version.id));

  const alreadyInstalled = await verifyInstalledVersion(version);
  const totalFiles = Math.max(version.files.length, 1);
  onProgress?.({
    stage: "preparing",
    message: `Preparing ${version.modelName}`,
    progress: alreadyInstalled ? 0.9 : 0.02,
  });

  if (!alreadyInstalled) {
    const VERIFICATION_PROGRESS_START = 0.86;
    const VERIFICATION_PROGRESS_END = 0.94;
    const descriptors = toDownloadDescriptors(version.files);
    for (const [index, descriptor] of descriptors.entries()) {
      const completedRatio = index / totalFiles;
      onProgress?.({
        stage: "downloading",
        message: `Downloading ${descriptor.path} (${index + 1}/${totalFiles})`,
        progress: Math.min(0.85, completedRatio * 0.8 + 0.05),
        filePath: descriptor.path,
      });

      const result = await ensureFileDownloaded(
        version,
        descriptor,
        (writtenBytes, expectedBytes) => {
          const hasExpectedSize = expectedBytes > 0;
          const fileProgress = hasExpectedSize
            ? writtenBytes / expectedBytes
            : 0;
          const overall = (index + fileProgress) / totalFiles;
          onProgress?.({
            stage: "downloading",
            message: hasExpectedSize
              ? `Downloading ${descriptor.path} (${Math.round(fileProgress * 100)}%)`
              : `Downloading ${descriptor.path} (${formatBytes(writtenBytes)} downloaded)`,
            progress: Math.min(
              0.85,
              (hasExpectedSize ? overall : completedRatio) * 0.8 + 0.05,
            ),
            filePath: descriptor.path,
          });
        },
        (hashedBytes, totalBytes) => {
          const safeTotalBytes = Math.max(totalBytes, 1);
          const fileHashProgress = hashedBytes / safeTotalBytes;
          const overallHashProgress = (index + fileHashProgress) / totalFiles;
          const boundedProgress =
            VERIFICATION_PROGRESS_START +
            overallHashProgress *
              (VERIFICATION_PROGRESS_END - VERIFICATION_PROGRESS_START);

          onProgress?.({
            stage: "verifying",
            message: `Verifying ${descriptor.path} (${formatBytes(hashedBytes)} / ${formatBytes(totalBytes)})`,
            progress: Math.max(
              VERIFICATION_PROGRESS_START,
              Math.min(VERIFICATION_PROGRESS_END, boundedProgress),
            ),
            filePath: descriptor.path,
            bytesProcessed: hashedBytes,
            totalBytes,
          });
        },
      );
      downloadedAny = downloadedAny || result.downloaded;
      bytesWritten += result.bytesWritten;
      totalAttempts += result.attempts;
      downloadSources.add(result.source);

      onProgress?.({
        stage: "verifying",
        message: `Verified ${descriptor.path}`,
        progress:
          VERIFICATION_PROGRESS_START +
          ((index + 1) / totalFiles) *
            (VERIFICATION_PROGRESS_END - VERIFICATION_PROGRESS_START),
        filePath: descriptor.path,
      });
    }

    await writeJsonFile(
      getInstallMetadataPath(version.id),
      toInstalledModelMetadata(version),
    );
  }

  onProgress?.({
    stage: "activating",
    message: `Activating ${version.modelName}`,
    progress: 0.95,
  });

  const modelPath = await activateVersion(version);

  await cleanupOldVersions(
    [version.id],
    Math.max(runtimeModelManifest.maxRetainedVersions, 2),
  );

  onProgress?.({
    stage: "ready",
    message: `${version.modelName} ready`,
    progress: 1,
  });

  const aggregatedSource =
    downloadSources.size === 0
      ? "cache"
      : downloadSources.size === 1
        ? Array.from(downloadSources)[0]
        : "mixed";

  return {
    modelDirectory: getModelDirectory(version.id),
    modelPath,
    downloaded: downloadedAny,
    activeVersionId: version.id,
    telemetry: {
      modelName: version.modelName,
      durationMs: Date.now() - startedAt,
      attempts: totalAttempts,
      bytesWritten,
      source: aggregatedSource,
    },
  };
}

function resolveActiveVersion(): RuntimeModelVersion {
  const version = runtimeModelManifest.versions.find(
    (entry) => entry.id === runtimeModelManifest.activeVersionId,
  );

  if (!version) {
    throw new Error(
      `Active runtime model version '${runtimeModelManifest.activeVersionId}' was not found in manifest.`,
    );
  }

  return version;
}

async function ensureModelAssetsInternal(
  onProgress?: ModelAssetProgressCallback,
): Promise<ModelAssetReadyResult | null> {
  // Keep compatibility with consumers expecting nullable, but runtime manifest always provides a version.
  if (!runtimeModelManifest.versions.length) {
    return null;
  }

  const activeVersion = resolveActiveVersion();
  const managerState = await readManagerState();

  const migrationRequired =
    managerState?.manifestVersion !== runtimeModelManifest.manifestVersion ||
    managerState?.activeVersionId !== activeVersion.id;

  if (!migrationRequired) {
    const isStillValid = await verifyInstalledVersion(activeVersion);
    if (isStillValid) {
      const modelPath = getModelFilePath(
        activeVersion.id,
        activeVersion.modelRelativePath,
      );
      onProgress?.({
        stage: "ready",
        message: `${activeVersion.modelName} ready`,
        progress: 1,
      });
      return {
        modelDirectory: getModelDirectory(activeVersion.id),
        modelPath,
        downloaded: false,
        activeVersionId: activeVersion.id,
      };
    }
  }

  const previousActiveVersionId = managerState?.activeVersionId;
  try {
    const result = await prepareVersion(activeVersion, onProgress);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to prepare active model version`, {
      versionId: activeVersion.id,
      previousActiveVersionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function ensureCoreMLModelAssets(
  onProgress?: ModelAssetProgressCallback,
): Promise<ModelAssetReadyResult | null> {
  const unsubscribe = onProgress
    ? ensureModelProgressEmitter.subscribe(onProgress)
    : undefined;

  if (!ensureModelPromise) {
    ensureModelPromise = ensureModelAssetsInternal((event) =>
      ensureModelProgressEmitter.emit(event),
    ).finally(() => {
      ensureModelPromise = null;
      ensureModelProgressEmitter.clear();
    });
  }

  try {
    return await ensureModelPromise;
  } finally {
    unsubscribe?.();
  }
}

export async function getDownloadedCoreMLModelPath(): Promise<string | null> {
  const managerState = await readManagerState();
  if (managerState?.activeModelPath) {
    const info = await FileSystem.getInfoAsync(managerState.activeModelPath);
    if (info.exists) {
      return managerState.activeModelPath;
    }
  }

  const activeVersion = resolveActiveVersion();
  const fallback = getModelFilePath(
    activeVersion.id,
    activeVersion.modelRelativePath,
  );
  const fallbackInfo = await FileSystem.getInfoAsync(fallback);
  return fallbackInfo.exists ? fallback : null;
}

export function getActiveModelDownloadConfigForDebug() {
  return toModelDownloadConfig(resolveActiveVersion());
}
