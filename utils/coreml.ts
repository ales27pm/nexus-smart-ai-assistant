export type CoreMLBridge = {
  loadModel: (opts: CoreMLLoadModelOptions) => Promise<unknown>;
  unloadModel: () => Promise<void>;
  isLoaded: () => Promise<boolean>;
  generate: (prompt: string, opts?: CoreMLGenerateOptions) => Promise<string>;
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

export const DEFAULT_COREML_MODEL_FILE =
  "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage";
export const DEFAULT_COREML_EOS_TOKEN_ID = 128256;

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
  computeUnits: "all",
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
};

export const DEFAULT_COREML_GENERATE_OPTIONS: CoreMLGenerateOptions = {
  maxNewTokens: 220,
  temperature: 0.8,
  topK: 40,
  topP: 0.95,
  repetitionPenalty: 1.05,
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
