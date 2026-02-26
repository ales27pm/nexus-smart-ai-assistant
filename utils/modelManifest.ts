type ComputeUnits = "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";

export type ModelManifest = {
  activeModel: string;
  tokenizerRepo: string;
  coremlRepo: string;
  contextLimit: number;
  eosTokenId: number;
  stopTokenIds: [number, number];
  computeUnits: ComputeUnits;
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
    eosTokenId: assertNonNegativeNumber(config.eosTokenId, "eosTokenId"),
    stopTokenIds: parseStopTokenIds(config.stopTokenIds),
    computeUnits: assertComputeUnits(config.computeUnits),
  };
}

const rawConfig = require("@/coreml-config.json") as unknown;

export const modelManifest: ModelManifest = parseManifest(rawConfig);
