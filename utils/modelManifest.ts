const config = require("@/coreml-config.json") as {
  activeModel: string;
  tokenizerRepo: string;
  coremlRepo: string;
  contextLimit: number;
  eosTokenId: number;
  stopTokenIds: number[];
  computeUnits: "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";
};

export type ModelManifest = {
  activeModel: string;
  tokenizerRepo: string;
  coremlRepo: string;
  contextLimit: number;
  eosTokenId: number;
  stopTokenIds: [number, number];
  computeUnits: "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";
};

const stopTokenIds = config.stopTokenIds as number[];
if (stopTokenIds.length !== 2) {
  throw new Error("coreml-config.json must provide exactly two stopTokenIds");
}

export const modelManifest: ModelManifest = {
  activeModel: config.activeModel,
  tokenizerRepo: config.tokenizerRepo,
  coremlRepo: config.coremlRepo,
  contextLimit: config.contextLimit,
  eosTokenId: config.eosTokenId,
  stopTokenIds: [stopTokenIds[0], stopTokenIds[1]],
  computeUnits: config.computeUnits,
};
