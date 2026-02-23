let requireNativeModule: (name: string) => unknown;
try {
  requireNativeModule = require("expo-modules-core").requireNativeModule;
} catch {
  requireNativeModule = () => null;
}

export type CoreMLComputeUnits =
  | "all"
  | "cpuOnly"
  | "cpuAndGPU"
  | "cpuAndNeuralEngine";

export type LoadModelOptions = {
  modelFile?: string;
  modelName?: string;
  modelPath?: string;
  inputIdsName?: string;
  attentionMaskName?: string;
  cachePositionName?: string;
  logitsName?: string;
  eosTokenId?: number;
  maxContext?: number;
  computeUnits?: CoreMLComputeUnits;
};

type TokenizerConfig = {
  kind: "none" | "gpt2_bpe";
  vocabJsonAssetPath?: string;
  mergesTxtAssetPath?: string;
  bosTokenId?: number;
  eosTokenId?: number;
};

export type GenerateOptions = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopTokenIds?: number[];
  seed?: number;
  tokenizer?: TokenizerConfig;
};

export type GenerateFromTokensOptions = Omit<GenerateOptions, "tokenizer"> & {
  maxContext?: number;
};

export type ModelInfo = {
  loaded: boolean;
  modelURL: string;
  computeUnits: CoreMLComputeUnits;
  expectsSingleToken: boolean;
  hasState: boolean;
  inputIdsName: string;
  attentionMaskName: string;
  cachePositionName: string;
  logitsName: string;
  eosTokenId?: number;
  maxContext?: number;
};

type NativeModuleShape = {
  loadModelAsync(opts: LoadModelOptions): Promise<ModelInfo>;
  unloadModelAsync(): Promise<void>;
  isLoadedAsync(): Promise<boolean>;
  tokenizeAsync(prompt: string, tokenizer: TokenizerConfig): Promise<number[]>;
  decodeAsync(tokenIds: number[], tokenizer: TokenizerConfig): Promise<string>;
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

function normalizeTokenizer(
  tokenizer?: TokenizerConfig,
): TokenizerConfig | undefined {
  if (!tokenizer) return undefined;
  const normalized: TokenizerConfig = {
    ...tokenizer,
    kind: tokenizer.kind ?? "gpt2_bpe",
  };
  if (normalized.kind === "none") {
    throw new Error(
      "tokenizer.kind='none' is invalid for tokenize/decode/generate paths that require a tokenizer.",
    );
  }
  return normalized;
}

export const CoreMLLLM = {
  loadModel: (opts: LoadModelOptions) => getNativeModule().loadModelAsync(opts),
  unloadModel: () => getNativeModule().unloadModelAsync(),
  isLoaded: () => getNativeModule().isLoadedAsync(),
  tokenize: (prompt: string, tokenizer: TokenizerConfig) =>
    getNativeModule().tokenizeAsync(prompt, normalizeTokenizer(tokenizer)!),
  decode: (tokenIds: number[], tokenizer: TokenizerConfig) =>
    getNativeModule().decodeAsync(tokenIds, normalizeTokenizer(tokenizer)!),
  generate: (prompt: string, opts: GenerateOptions) =>
    getNativeModule().generateAsync(prompt, {
      ...opts,
      tokenizer: normalizeTokenizer(opts.tokenizer),
    }),
  generateFromTokens: (
    tokenIds: number[],
    opts: GenerateFromTokensOptions = {},
  ) => getNativeModule().generateFromTokensAsync(tokenIds, opts),
};

export default CoreMLLLM;
