type ComputeUnits = "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";

export type ModelManifest = {
  activeModel: string;
  tokenizerRepo: string;
  coremlRepo: string;
  contextLimit: number;
  bosTokenId: number;
  eosTokenId: number;
  stopTokenIds: [number, number];
  computeUnits: ComputeUnits;
  modelDownload?: ModelDownloadConfig;
};

export type RuntimeModelManifest = {
  manifestVersion: number;
  minimumAppSupportedSchemaVersion: number;
  maxRetainedVersions: number;
  activeVersionId: string;
  versions: RuntimeModelVersion[];
};

export type RuntimeModelVersion = {
  id: string;
  modelName: string;
  modelRelativePath: string;
  retries?: number;
  files: RuntimeModelFile[];
};

export type RuntimeModelFile = {
  path: string;
  sha256: string;
  sources: string[];
};

export type ModelDownloadConfig = {
  modelName: string;
  modelRelativePath: string;
  retries?: number;
  files: {
    path: string;
    url: string;
    sha256: string;
  }[];
};

function assertNonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`coreml-config.json: ${key} must be a non-empty string`);
  }
  return value;
}

function assertNonNegativeNumber(value: unknown, key: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`coreml-config.json: ${key} must be a non-negative number`);
  }
  return value;
}

function assertComputeUnits(value: unknown): ComputeUnits {
  const allowed: ComputeUnits[] = [
    "all",
    "cpuOnly",
    "cpuAndGPU",
    "cpuAndNeuralEngine",
  ];

  if (typeof value !== "string" || !allowed.includes(value as ComputeUnits)) {
    throw new Error(
      "coreml-config.json: computeUnits must be one of all|cpuOnly|cpuAndGPU|cpuAndNeuralEngine",
    );
  }

  return value as ComputeUnits;
}

function parseStopTokenIds(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(
      "coreml-config.json: stopTokenIds must contain exactly 2 items",
    );
  }

  const parsed = value.map((tokenId, index) =>
    assertNonNegativeNumber(tokenId, `stopTokenIds[${index}]`),
  );

  return [parsed[0], parsed[1]];
}

function parseModelDownloadConfig(value: unknown): ModelDownloadConfig {
  if (!value || typeof value !== "object") {
    throw new Error("coreml-config.json: modelDownload must be an object");
  }

  const config = value as Record<string, unknown>;
  const files = config.files;

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(
      "coreml-config.json: modelDownload.files must be a non-empty array",
    );
  }

  const retriesValue = config.retries;
  let retries: number | undefined;
  if (retriesValue !== undefined) {
    retries = assertNonNegativeNumber(retriesValue, "modelDownload.retries");
  }

  return {
    modelName: assertNonEmptyString(
      config.modelName,
      "modelDownload.modelName",
    ),
    modelRelativePath: assertNonEmptyString(
      config.modelRelativePath,
      "modelDownload.modelRelativePath",
    ),
    retries,
    files: files.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(
          `coreml-config.json: modelDownload.files[${index}] must be an object`,
        );
      }

      const file = item as Record<string, unknown>;

      return {
        path: assertNonEmptyString(
          file.path,
          `modelDownload.files[${index}].path`,
        ),
        url: assertNonEmptyString(
          file.url,
          `modelDownload.files[${index}].url`,
        ),
        sha256: assertNonEmptyString(
          file.sha256,
          `modelDownload.files[${index}].sha256`,
        ),
      };
    }),
  };
}

function parseRuntimeModelFile(
  value: unknown,
  index: number,
): RuntimeModelFile {
  if (!value || typeof value !== "object") {
    throw new Error(
      `coreml-runtime-manifest.json: versions[*].files[${index}] must be an object`,
    );
  }

  const file = value as Record<string, unknown>;
  const sources = file.sources;

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(
      `coreml-runtime-manifest.json: versions[*].files[${index}].sources must be a non-empty array`,
    );
  }

  return {
    path: assertNonEmptyString(file.path, `versions[*].files[${index}].path`),
    sha256: assertNonEmptyString(
      file.sha256,
      `versions[*].files[${index}].sha256`,
    ),
    sources: sources.map((source, sourceIndex) =>
      assertNonEmptyString(
        source,
        `versions[*].files[${index}].sources[${sourceIndex}]`,
      ),
    ),
  };
}

function parseRuntimeModelVersion(
  value: unknown,
  index: number,
): RuntimeModelVersion {
  if (!value || typeof value !== "object") {
    throw new Error(
      `coreml-runtime-manifest.json: versions[${index}] must be an object`,
    );
  }

  const version = value as Record<string, unknown>;
  const files = version.files;

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(
      `coreml-runtime-manifest.json: versions[${index}].files must be a non-empty array`,
    );
  }

  const retriesValue = version.retries;
  let retries: number | undefined;

  if (retriesValue !== undefined) {
    retries = assertNonNegativeNumber(
      retriesValue,
      `versions[${index}].retries`,
    );
  }

  return {
    id: assertNonEmptyString(version.id, `versions[${index}].id`),
    modelName: assertNonEmptyString(
      version.modelName,
      `versions[${index}].modelName`,
    ),
    modelRelativePath: assertNonEmptyString(
      version.modelRelativePath,
      `versions[${index}].modelRelativePath`,
    ),
    retries,
    files: files.map((file, fileIndex) =>
      parseRuntimeModelFile(file, fileIndex),
    ),
  };
}

function parseRuntimeManifest(raw: unknown): RuntimeModelManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("coreml-runtime-manifest.json: manifest must be an object");
  }

  const manifest = raw as Record<string, unknown>;
  const versionsRaw = manifest.versions;

  if (!Array.isArray(versionsRaw) || versionsRaw.length === 0) {
    throw new Error(
      "coreml-runtime-manifest.json: versions must be a non-empty array",
    );
  }

  const versions = versionsRaw.map((version, index) =>
    parseRuntimeModelVersion(version, index),
  );

  const activeVersionId = assertNonEmptyString(
    manifest.activeVersionId,
    "activeVersionId",
  );

  if (!versions.some((version) => version.id === activeVersionId)) {
    throw new Error(
      "coreml-runtime-manifest.json: activeVersionId must exist in versions",
    );
  }

  return {
    manifestVersion: assertNonNegativeNumber(
      manifest.manifestVersion,
      "manifestVersion",
    ),
    minimumAppSupportedSchemaVersion: assertNonNegativeNumber(
      manifest.minimumAppSupportedSchemaVersion,
      "minimumAppSupportedSchemaVersion",
    ),
    maxRetainedVersions: Math.max(
      1,
      assertNonNegativeNumber(
        manifest.maxRetainedVersions,
        "maxRetainedVersions",
      ),
    ),
    activeVersionId,
    versions,
  };
}

export function toModelDownloadConfig(
  runtimeVersion: RuntimeModelVersion,
): ModelDownloadConfig {
  return {
    modelName: runtimeVersion.modelName,
    modelRelativePath: runtimeVersion.modelRelativePath,
    retries: runtimeVersion.retries,
    files: runtimeVersion.files.map((file) => ({
      path: file.path,
      url: file.sources[0],
      sha256: file.sha256,
    })),
  };
}

const APP_SUPPORTED_RUNTIME_SCHEMA_VERSION = 1;

function parseManifest(raw: unknown): ModelManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("coreml-config.json: manifest must be an object");
  }

  const config = raw as Record<string, unknown>;

  return {
    activeModel: assertNonEmptyString(config.activeModel, "activeModel"),
    tokenizerRepo: assertNonEmptyString(config.tokenizerRepo, "tokenizerRepo"),
    coremlRepo: assertNonEmptyString(config.coremlRepo, "coremlRepo"),
    contextLimit: assertNonNegativeNumber(config.contextLimit, "contextLimit"),
    bosTokenId: assertNonNegativeNumber(config.bosTokenId, "bosTokenId"),
    eosTokenId: assertNonNegativeNumber(config.eosTokenId, "eosTokenId"),
    stopTokenIds: parseStopTokenIds(config.stopTokenIds),
    computeUnits: assertComputeUnits(config.computeUnits),
    modelDownload:
      config.modelDownload === undefined
        ? undefined
        : parseModelDownloadConfig(config.modelDownload),
  };
}

const rawConfig = require("@/coreml-config.json") as unknown;
const rawRuntimeManifest = require("@/coreml-runtime-manifest.json") as unknown;

export const modelManifest: ModelManifest = parseManifest(rawConfig);
export const runtimeModelManifest: RuntimeModelManifest =
  parseRuntimeManifest(rawRuntimeManifest);

if (
  runtimeModelManifest.minimumAppSupportedSchemaVersion >
  APP_SUPPORTED_RUNTIME_SCHEMA_VERSION
) {
  throw new Error(
    `coreml-runtime-manifest.json requires app runtime schema ${runtimeModelManifest.minimumAppSupportedSchemaVersion}, but this app supports ${APP_SUPPORTED_RUNTIME_SCHEMA_VERSION}.`,
  );
}
