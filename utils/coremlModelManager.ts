import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system/legacy";
import { sha256 } from "js-sha256";
import { modelManifest, type ModelDownloadConfig } from "@/utils/modelManifest";

const LOG_PREFIX = "[CoreMLModelManager]";
const DEFAULT_RETRY_COUNT = 3;
const DOWNLOAD_STATE_FILE = "download-state.json";

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
  telemetry?: ModelAssetDownloadTelemetry;
};

type DownloadState = {
  inProgress: boolean;
  startedAt: string;
  updatedAt: string;
  lastError?: string;
};

type ModelFileDescriptor = {
  path: string;
  url: string;
  sha256: string;
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

function getModelDirectory(config: ModelDownloadConfig): string {
  return `${getModelsRootDirectory()}${config.modelName}/`;
}

function getStateFilePath(config: ModelDownloadConfig): string {
  return `${getModelDirectory(config)}${DOWNLOAD_STATE_FILE}`;
}

async function ensureDirectory(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function writeDownloadState(
  config: ModelDownloadConfig,
  state: DownloadState,
): Promise<void> {
  await FileSystem.writeAsStringAsync(
    getStateFilePath(config),
    JSON.stringify(state, null, 2),
  );
}

async function clearDownloadState(config: ModelDownloadConfig): Promise<void> {
  const statePath = getStateFilePath(config);
  const stateInfo = await FileSystem.getInfoAsync(statePath);
  if (stateInfo.exists) {
    await FileSystem.deleteAsync(statePath, { idempotent: true });
  }
}

function toAbsoluteModelPath(config: ModelDownloadConfig): string {
  return `${getModelDirectory(config)}${config.modelRelativePath}`;
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
  absolutePath: string,
  expectedHash: string,
): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(absolutePath);
  if (!info.exists || info.size === 0) {
    return false;
  }

  const digest = await hashFileSha256(absolutePath);
  return digest.toLowerCase() === expectedHash.toLowerCase();
}

async function deleteIfExists(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

async function downloadWithResume(
  descriptor: ModelFileDescriptor,
  destination: string,
  retries: number,
): Promise<number> {
  let attempt = 0;
  let bytesWritten = 0;

  while (attempt < retries) {
    attempt += 1;

    const resumable = FileSystem.createDownloadResumable(
      descriptor.url,
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
      console.warn(`${LOG_PREFIX} download attempt failed`, {
        file: descriptor.path,
        attempt,
        retries,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt >= retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw new Error(`Exhausted retries for ${descriptor.path}`);
}

async function ensureFileDownloaded(
  config: ModelDownloadConfig,
  descriptor: ModelFileDescriptor,
  retries: number,
): Promise<{ downloaded: boolean; bytesWritten: number }> {
  const targetPath = `${getModelDirectory(config)}${descriptor.path}`;
  const targetDir = targetPath.split("/").slice(0, -1).join("/");
  await ensureDirectory(`${targetDir}/`);

  const validExistingFile = await validateFileHash(
    targetPath,
    descriptor.sha256,
  );
  if (validExistingFile) {
    return { downloaded: false, bytesWritten: 0 };
  }

  await deleteIfExists(targetPath);
  const bytesWritten = await downloadWithResume(
    descriptor,
    targetPath,
    retries,
  );

  const isValid = await validateFileHash(targetPath, descriptor.sha256);
  if (!isValid) {
    await deleteIfExists(targetPath);
    console.error(`${LOG_PREFIX} hash mismatch`, {
      file: descriptor.path,
      expectedHash: descriptor.sha256,
    });
    throw new Error(
      `Hash mismatch for ${descriptor.path}; model asset integrity check failed.`,
    );
  }

  return { downloaded: true, bytesWritten };
}

function mapDescriptors(config: ModelDownloadConfig): ModelFileDescriptor[] {
  return config.files.map((file) => ({
    path: file.path,
    url: file.url,
    sha256: file.sha256,
  }));
}

async function ensureModelAssetsInternal(
  config: ModelDownloadConfig,
): Promise<ModelAssetReadyResult> {
  const start = Date.now();
  const modelDir = getModelDirectory(config);
  const descriptors = mapDescriptors(config);

  await ensureDirectory(getModelsRootDirectory());
  await ensureDirectory(modelDir);

  const state: DownloadState = {
    inProgress: true,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeDownloadState(config, state);

  let totalBytes = 0;
  let downloadedAny = false;

  try {
    for (const descriptor of descriptors) {
      const { downloaded, bytesWritten } = await ensureFileDownloaded(
        config,
        descriptor,
        config.retries ?? DEFAULT_RETRY_COUNT,
      );
      if (downloaded) {
        downloadedAny = true;
      }
      totalBytes += bytesWritten;
    }

    const modelPath = toAbsoluteModelPath(config);
    const modelInfo = await FileSystem.getInfoAsync(modelPath);
    if (!modelInfo.exists) {
      throw new Error(`Model path is missing after download: ${modelPath}`);
    }

    await clearDownloadState(config);

    const telemetry: ModelAssetDownloadTelemetry = {
      modelName: config.modelName,
      durationMs: Date.now() - start,
      attempts: config.retries ?? DEFAULT_RETRY_COUNT,
      bytesWritten: totalBytes,
    };

    console.info(`${LOG_PREFIX} model assets ready`, telemetry);

    return {
      modelDirectory: modelDir,
      modelPath,
      downloaded: downloadedAny,
      telemetry,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeDownloadState(config, {
      ...state,
      inProgress: false,
      updatedAt: new Date().toISOString(),
      lastError: message,
    });

    console.error(`${LOG_PREFIX} failed to prepare model assets`, {
      modelName: config.modelName,
      durationMs: Date.now() - start,
      error: message,
    });

    throw error;
  }
}

export async function ensureCoreMLModelAssets(): Promise<ModelAssetReadyResult | null> {
  if (!modelManifest.modelDownload) {
    return null;
  }

  if (!ensureModelPromise) {
    ensureModelPromise = ensureModelAssetsInternal(
      modelManifest.modelDownload,
    ).finally(() => {
      ensureModelPromise = null;
    });
  }

  return ensureModelPromise;
}

export async function getDownloadedCoreMLModelPath(): Promise<string | null> {
  if (!modelManifest.modelDownload) {
    return null;
  }

  const modelPath = toAbsoluteModelPath(modelManifest.modelDownload);
  const info = await FileSystem.getInfoAsync(modelPath);
  return info.exists ? modelPath : null;
}
