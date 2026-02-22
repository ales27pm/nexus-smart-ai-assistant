import { requireNativeModule } from "expo-modules-core";

export type CoreMLComputeUnits =
  | "all"
  | "cpuOnly"
  | "cpuAndGPU"
  | "cpuAndNeuralEngine";

export type LoadModelOptions = {
  modelName?: string;
  modelPath?: string;
  inputIdsName?: string;
  attentionMaskName?: string;
  logitsName?: string;
  eosTokenId?: number;
  computeUnits?: CoreMLComputeUnits;
};

export type GenerateOptions = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopTokenIds?: number[];
  seed?: number;
  tokenizer?: {
    vocabJsonAssetPath: string;
    mergesTxtAssetPath: string;
    bosTokenId?: number;
    eosTokenId?: number;
  };
};

export type GenerateFromTokensOptions = GenerateOptions & {
  maxContext?: number;
};

export type ModelInfo = {
  loaded: boolean;
  inputIdsName: string;
  attentionMaskName?: string;
  logitsName: string;
  eosTokenId?: number;
  computeUnits: CoreMLComputeUnits;
};

const Native = requireNativeModule("ExpoCoreMLLLMModule") as {
  loadModelAsync(opts: LoadModelOptions): Promise<ModelInfo>;
  unloadModelAsync(): Promise<void>;
  isLoadedAsync(): Promise<boolean>;
  tokenizeAsync(
    prompt: string,
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ): Promise<number[]>;
  decodeAsync(
    tokenIds: number[],
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ): Promise<string>;
  generateAsync(prompt: string, opts: GenerateOptions): Promise<string>;
  generateFromTokensAsync(
    tokenIds: number[],
    opts: GenerateFromTokensOptions,
  ): Promise<number[]>;
};

export const CoreMLLLM = {
  loadModel: (opts: LoadModelOptions) => Native.loadModelAsync(opts),
  unloadModel: () => Native.unloadModelAsync(),
  isLoaded: () => Native.isLoadedAsync(),
  tokenize: (
    prompt: string,
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ) => Native.tokenizeAsync(prompt, tokenizer),
  decode: (
    tokenIds: number[],
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ) => Native.decodeAsync(tokenIds, tokenizer),
  generate: (prompt: string, opts: GenerateOptions = {}) =>
    Native.generateAsync(prompt, opts),
  generateFromTokens: (
    tokenIds: number[],
    opts: GenerateFromTokensOptions = {},
  ) => Native.generateFromTokensAsync(tokenIds, opts),
};

export default CoreMLLLM;
