import * as FileSystem from "expo-file-system/legacy";
import {
  runtimeModelManifest,
  toModelDownloadConfig,
  type RuntimeModelFile,
  type RuntimeModelVersion,
} from "@/utils/modelManifest";
import { Buffer } from "buffer";
import { sha256 } from "js-sha256";

const LOG_PREFIX = "[CoreMLModelManager]";
const DEFAULT_RETRY_COUNT = 3;
const INSTALL_METADATA_FILE = "install-metadata.json";
const MANAGER_STATE_FILE = "manager-state.json";

type DownloadFileDescriptor = {
  path: string;
  expectedHash: string;
  sources: string[];
};

export type ModelAssetDownloadTelemetry = {
  modelName: string;
  durationMs: number;
  attempts: number;
  bytesWritten: number;
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

async function hashFileSha256(path: string): Promise<string> {
  const chunkSize = 1024 * 1024;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || typeof info.size !== "number") {
    throw new Error(`Unable to hash missing file: ${path}`);
  }

  const hasher = sha256.create();

  for (let position = 0; position < info.size; position += chunkSize) {
    const length = Math.min(chunkSize, info.size - position);
    const chunk = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    hasher.update(Buffer.from(chunk, "base64"));
  }

  return hasher.hex();
}

async function validateFileHash(
  path: string,
  expectedHash: string,
): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.size === 0) {
    return false;
  }

  const digest = await hashFileSha256(path);
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

async function downloadWithFallbackSources(
  descriptor: DownloadFileDescriptor,
  destination: string,
  retries: number,
): Promise<number> {
  let bytesWritten = 0;
  let lastError: unknown = null;

  for (const source of descriptor.sources) {
    let attempt = 0;
    while (attempt < retries) {
      attempt += 1;

      const resumable = FileSystem.createDownloadResumable(
        source,
        destination,
        {},
        (progress) => {
          bytesWritten = progress.totalBytesWritten;
        },
      );

      try {
        const response = await resumable.downloadAsync();
        if (!response || response.status !== 200) {
          throw new Error(
            `Download failed for ${descriptor.path} with status ${response?.status ?? "unknown"}`,
          );
        }

        return bytesWritten;
      } catch (error) {
        lastError = error;
        console.warn(`${LOG_PREFIX} download attempt failed`, {
          file: descriptor.path,
          source,
          attempt,
          retries,
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
      `Failed to download ${descriptor.path} from all configured sources`,
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
): Promise<{ downloaded: boolean; bytesWritten: number }> {
  const targetPath = getModelFilePath(version.id, descriptor.path);
  const targetDir = `${targetPath.split("/").slice(0, -1).join("/")}/`;
  await ensureDirectory(targetDir);

  const validExisting = await validateFileHash(
    targetPath,
    descriptor.expectedHash,
  );
  if (validExisting) {
    return { downloaded: false, bytesWritten: 0 };
  }

  await deleteIfExists(targetPath);
  const bytesWritten = await downloadWithFallbackSources(
    descriptor,
    targetPath,
    version.retries ?? DEFAULT_RETRY_COUNT,
  );

  const validDownloaded = await validateFileHash(
    targetPath,
    descriptor.expectedHash,
  );
  if (!validDownloaded) {
    await deleteIfExists(targetPath);
    throw new Error(
      `Hash mismatch for ${descriptor.path}; integrity check failed.`,
    );
  }

  return { downloaded: true, bytesWritten };
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
): Promise<ModelAssetReadyResult> {
  const startedAt = Date.now();
  let bytesWritten = 0;
  let downloadedAny = false;

  await ensureDirectory(getModelsRootDirectory());
  await ensureDirectory(getModelDirectory(version.id));

  const alreadyInstalled = await verifyInstalledVersion(version);
  if (!alreadyInstalled) {
    for (const descriptor of toDownloadDescriptors(version.files)) {
      const result = await ensureFileDownloaded(version, descriptor);
      downloadedAny = downloadedAny || result.downloaded;
      bytesWritten += result.bytesWritten;
    }

    await writeJsonFile(
      getInstallMetadataPath(version.id),
      toInstalledModelMetadata(version),
    );
  }

  const modelPath = await activateVersion(version);

  await cleanupOldVersions(
    [version.id],
    Math.max(runtimeModelManifest.maxRetainedVersions, 2),
  );

  return {
    modelDirectory: getModelDirectory(version.id),
    modelPath,
    downloaded: downloadedAny,
    activeVersionId: version.id,
    telemetry: {
      modelName: version.modelName,
      durationMs: Date.now() - startedAt,
      attempts: version.retries ?? DEFAULT_RETRY_COUNT,
      bytesWritten,
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

async function ensureModelAssetsInternal(): Promise<ModelAssetReadyResult | null> {
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
    const result = await prepareVersion(activeVersion);
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

export async function ensureCoreMLModelAssets(): Promise<ModelAssetReadyResult | null> {
  if (!ensureModelPromise) {
    ensureModelPromise = ensureModelAssetsInternal().finally(() => {
      ensureModelPromise = null;
    });
  }

  return ensureModelPromise;
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
