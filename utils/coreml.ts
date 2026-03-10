import { modelManifest } from "@/utils/modelManifest";

export type CoreMLBridge = {
  loadModel: (opts: CoreMLLoadModelOptions) => Promise<unknown>;
  unloadModel: () => Promise<void>;
  isLoaded: () => Promise<boolean>;
  tokenize: (
    prompt: string,
    tokenizer: NonNullable<CoreMLGenerateOptions["tokenizer"]>,
  ) => Promise<number[]>;
  decode: (
    tokenIds: number[],
    tokenizer: NonNullable<CoreMLGenerateOptions["tokenizer"]>,
  ) => Promise<string>;
  generateFromTokens: (
    tokenIds: number[],
    opts?: Omit<CoreMLGenerateOptions, "tokenizer"> & { maxContext?: number },
  ) => Promise<number[]>;
  beginGenerationSession?: (opts: {
    promptTokenIds: number[];
    maxContext?: number;
    generation?: Omit<CoreMLGenerateOptions, "tokenizer">;
  }) => Promise<boolean>;
  generateNextToken?: () => Promise<number | null>;
  endGenerationSession?: () => Promise<void>;
  generate: (prompt: string, opts?: CoreMLGenerateOptions) => Promise<string>;
  cancel: () => Promise<void>;
};

export type CoreMLLoadModelOptions = {
  modelFile?: string;
  modelName?: string;
  modelPath?: string;
  inputIdsName?: string;
  attentionMaskName?: string;
  cachePositionName?: string;
  logitsName?: string;
  computeUnits?: "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";
  eosTokenId?: number;
  maxContext?: number;
};

export type CoreMLLoadUxState =
  | "downloading model"
  | "downloading model (unknown total size)"
  | "verifying model"
  | "ready"
  | "failed—retry";

export type CoreMLGenerateOptions = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopTokenIds?: number[];
  seed?: number;
  tokenizer?: {
    kind: "none" | "gpt2_bpe" | "byte_level_bpe";
    vocabJsonAssetPath?: string;
    mergesTxtAssetPath?: string;
    eosTokenId?: number;
    bosTokenId?: number;
  };
};

export const COREML_ERROR_BUSY = 1001;
export const COREML_ERROR_ABORT = 1002;

export class CoreMLError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "CoreMLError";
  }
}

export type CoreMLModelPresetId = "fp16" | "int8" | "int4Lut";

export type CoreMLModelPreset = {
  id: CoreMLModelPresetId;
  label: string;
  modelFile: string;
  detail: string;
};

export const COREML_MODEL_PRESETS: readonly CoreMLModelPreset[] = [
  {
    id: "fp16",
    label: "FP16",
    modelFile: "Dolphin3.0-Llama3.2-3B-fp16.mlpackage",
    detail: "Full precision (best quality, largest memory footprint).",
  },
  {
    id: "int8",
    label: "INT8",
    modelFile: "Dolphin3.0-Llama3.2-3B-int8.mlpackage",
    detail: "8-bit quantized (balanced speed and quality).",
  },
  {
    id: "int4Lut",
    label: "INT4-LUT",
    modelFile: "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
    detail:
      "Palettized/lookup-table compressed weights (lowest memory footprint).",
  },
] as const;

export const DEFAULT_COREML_MODEL_PRESET_ID: CoreMLModelPresetId = "int4Lut";

export const DEFAULT_COREML_EOS_TOKEN_ID = modelManifest.eosTokenId;
export const DEFAULT_COREML_BOS_TOKEN_ID = modelManifest.bosTokenId;
export const DEFAULT_COREML_TOKENIZER_VOCAB_PATH =
  "module:tokenizers/byte_level_bpe/vocab.json";
export const DEFAULT_COREML_TOKENIZER_MERGES_PATH =
  "module:tokenizers/byte_level_bpe/merges.txt";

export const DEFAULT_COREML_TOKENIZER = {
  kind: "byte_level_bpe",
  vocabJsonAssetPath: DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
  mergesTxtAssetPath: DEFAULT_COREML_TOKENIZER_MERGES_PATH,
  bosTokenId: DEFAULT_COREML_BOS_TOKEN_ID,
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
} as const;

export const DEFAULT_COREML_LOAD_OPTIONS: CoreMLLoadModelOptions = {
  inputIdsName: "input_ids",
  attentionMaskName: "attention_mask",
  cachePositionName: "cache_position",
  logitsName: "logits",
  computeUnits: modelManifest.computeUnits,
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
  maxContext: modelManifest.contextLimit,
};

export function withPreparedCoreMLModelPath(
  baseOptions: CoreMLLoadModelOptions,
  preparedModelPath: string | null | undefined,
): CoreMLLoadModelOptions {
  const normalizedPath = preparedModelPath?.trim();

  if (!normalizedPath) {
    throw new CoreMLError(
      "CoreML modelPath is required and must come from prepared/downloaded assets.",
      20,
    );
  }

  const nextOptions: CoreMLLoadModelOptions = {
    ...baseOptions,
    modelPath: normalizedPath,
  };
  delete nextOptions.modelFile;
  return nextOptions;
}

export function requireCoreMLModelPath(
  options: CoreMLLoadModelOptions,
): CoreMLLoadModelOptions {
  const normalizedPath = options.modelPath?.trim();
  if (!normalizedPath) {
    throw new CoreMLError(
      "CoreML modelPath is required and must come from prepared/downloaded assets.",
      20,
    );
  }

  const nextOptions: CoreMLLoadModelOptions = {
    ...options,
    modelPath: normalizedPath,
  };
  delete nextOptions.modelFile;
  return nextOptions;
}

export const DEFAULT_COREML_GENERATE_OPTIONS: CoreMLGenerateOptions = {
  maxNewTokens: 220,
  temperature: 0.8,
  topK: 40,
  topP: 0.95,
  repetitionPenalty: 1.05,
  stopTokenIds: [...modelManifest.stopTokenIds],
  tokenizer: DEFAULT_COREML_TOKENIZER,
};

export function buildCoreMLChatPrompt(systemPrompt: string, userText: string) {
  return `${systemPrompt}\n\nUser: ${userText}\nAssistant:`;
}

export function cleanCoreMLOutput(rawOutput: string, prompt: string) {
  const stripped = rawOutput.startsWith(prompt)
    ? rawOutput.slice(prompt.length)
    : rawOutput;
  return stripped.replace(/^\s+/, "").trimEnd() || "(no output)";
}

function looksLikeExecutionPlanBuildFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("execution plan") ||
    normalized.includes("model architecture file") ||
    normalized.includes("model.mil") ||
    normalized.includes("error code: -4") ||
    normalized.includes("error code -4")
  );
}

function looksLikeModelNotLoaded(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("load the coreml model first") ||
    normalized.includes("model not loaded")
  );
}

function deriveCoreMLErrorCode(
  error: Error & { code?: unknown },
): number | undefined {
  const maybeCode = Number(error.code);
  if (Number.isFinite(maybeCode)) {
    if (maybeCode === -4 && looksLikeExecutionPlanBuildFailure(error.message)) {
      return 104;
    }
    return maybeCode;
  }

  if (looksLikeExecutionPlanBuildFailure(error.message)) {
    return 104;
  }

  if (looksLikeModelNotLoaded(error.message)) {
    return 20;
  }

  return undefined;
}

function getNativeCoreMLErrorCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const maybeCode = Number((error as Error & { code?: unknown }).code);
  if (Number.isFinite(maybeCode)) {
    return maybeCode;
  }

  return undefined;
}

export function isComputeUnitError(error: unknown): boolean {
  if (getNativeCoreMLErrorCode(error) === -4) {
    return true;
  }

  return normalizeCoreMLError(error).code === 104;
}

export function normalizeCoreMLError(error: unknown): CoreMLError {
  if (error instanceof CoreMLError) return error;
  if (error instanceof Error) {
    const normalizedCode = deriveCoreMLErrorCode(
      error as Error & { code?: unknown },
    );
    return new CoreMLError(error.message, normalizedCode);
  }
  return new CoreMLError(
    typeof error === "string" ? error : "Unknown CoreML failure",
  );
}

export const COREML_ACTIONABLE_ERRORS: Record<number, string> = {
  [COREML_ERROR_BUSY]:
    "CoreML runtime is busy transitioning state or handling another request. Wait until the model reports Ready and retry.",
  [COREML_ERROR_ABORT]:
    "Generation was aborted. Retry the request if cancellation was not intentional.",
  10: "CoreML resource bundle missing. Run prebuild + pod install, then rebuild the iOS app.",
  12: "Tokenizer asset missing from bundle. Run the tokenizer install step before building iOS.",
  20: "No CoreML model selected. Provide modelPath from prepared assets and retry.",
  21: "CoreML resource bundle not found. Re-run prebuild and install pods.",
  22: "CoreML model file not found in bundle. Redownload model assets and rebuild.",
  101: "CoreML model resource missing. Redownload model assets and rebuild the app.",
  102: "CoreML memory pressure detected. Free up memory by closing apps and retry.",
  104: "CoreML execution-plan build failed for this model on this device. Try computeUnits=cpuOnly, use a smaller/compatible model, or regenerate the model for the target iOS/CoreML runtime.",
  105: "CoreML model compilation failed before load. Verify downloaded model assets are complete/compatible, clear stale compiled cache, and retry.",
  120: "Tokenizer config invalid. Use byte_level_bpe or gpt2_bpe with matching vocab/merges assets.",
  121: "Tokenizer asset paths missing. Provide both vocabJsonAssetPath and mergesTxtAssetPath.",
  122: "Tokenizer required for this model. Pass tokenizer settings with vocab/merges assets.",
};

export function toActionableCoreMLError(error: unknown): CoreMLError {
  const normalized = normalizeCoreMLError(error);
  if (!normalized.code) return normalized;

  const hint = COREML_ACTIONABLE_ERRORS[normalized.code];
  if (!hint) return normalized;

  return new CoreMLError(`${normalized.message} (${hint})`, normalized.code);
}
