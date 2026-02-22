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

type NativeModuleShape = {
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

let nativeModule: NativeModuleShape | null = null;

function getNativeModule(): NativeModuleShape {
  if (nativeModule) return nativeModule;

  try {
    nativeModule = requireNativeModule(
      "ExpoCoreMLLLMModule",
    ) as NativeModuleShape;
    return nativeModule;
  } catch {
    throw new Error(
      "ExpoCoreMLLLMModule is not available. Ensure you ran `npx expo prebuild --clean`, installed pods, and launched an iOS dev client containing this native module.",
    );
  }
}

export const CoreMLLLM = {
  loadModel: (opts: LoadModelOptions) => getNativeModule().loadModelAsync(opts),
  unloadModel: () => getNativeModule().unloadModelAsync(),
  isLoaded: () => getNativeModule().isLoadedAsync(),
  tokenize: (
    prompt: string,
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ) => getNativeModule().tokenizeAsync(prompt, tokenizer),
  decode: (
    tokenIds: number[],
    tokenizer: NonNullable<GenerateOptions["tokenizer"]>,
  ) => getNativeModule().decodeAsync(tokenIds, tokenizer),
  generate: (prompt: string, opts: GenerateOptions = {}) =>
    getNativeModule().generateAsync(prompt, opts),
  generateFromTokens: (
    tokenIds: number[],
    opts: GenerateFromTokensOptions = {},
  ) => getNativeModule().generateFromTokensAsync(tokenIds, opts),
};

export default CoreMLLLM;
