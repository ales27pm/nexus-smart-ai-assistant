import { modelManifest } from "@/utils/modelManifest";

export type CoreMLBridge = {
  loadModel: (opts: CoreMLLoadModelOptions) => Promise<unknown>;
  unloadModel: () => Promise<void>;
  isLoaded: () => Promise<boolean>;
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

export type CoreMLGenerateOptions = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  stopTokenIds?: number[];
  seed?: number;
  tokenizer?: {
    kind: "none" | "gpt2_bpe";
    vocabJsonAssetPath?: string;
    mergesTxtAssetPath?: string;
    eosTokenId?: number;
    bosTokenId?: number;
  };
};

export class CoreMLError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "CoreMLError";
  }
}

export const DEFAULT_COREML_MODEL_FILE = modelManifest.activeModel;
export const DEFAULT_COREML_EOS_TOKEN_ID = modelManifest.eosTokenId;

export const DEFAULT_COREML_TOKENIZER = {
  kind: "none",
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
} as const;

export const DEFAULT_COREML_LOAD_OPTIONS: CoreMLLoadModelOptions = {
  modelFile: DEFAULT_COREML_MODEL_FILE,
  inputIdsName: "input_ids",
  attentionMaskName: "attention_mask",
  cachePositionName: "cache_position",
  logitsName: "logits",
  computeUnits: modelManifest.computeUnits,
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
  maxContext: modelManifest.contextLimit,
};

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

export function normalizeCoreMLError(error: unknown): CoreMLError {
  if (error instanceof CoreMLError) return error;
  if (error instanceof Error) {
    const maybeCode = Number((error as Error & { code?: unknown }).code);
    return new CoreMLError(
      error.message,
      Number.isFinite(maybeCode) ? maybeCode : undefined,
    );
  }
  return new CoreMLError(
    typeof error === "string" ? error : "Unknown CoreML failure",
  );
}

export const COREML_ACTIONABLE_ERRORS: Record<number, string> = {
  101: "CoreML model resource missing. Redownload model assets and rebuild the app.",
  102: "CoreML memory pressure detected. Free up memory by closing apps and retry.",
};

export function toActionableCoreMLError(error: unknown): CoreMLError {
  const normalized = normalizeCoreMLError(error);
  if (!normalized.code) return normalized;

  const hint = COREML_ACTIONABLE_ERRORS[normalized.code];
  if (!hint) return normalized;

  return new CoreMLError(`${normalized.message} (${hint})`, normalized.code);
}
