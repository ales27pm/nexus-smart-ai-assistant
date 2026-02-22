export type CoreMLBridge = {
  loadModel: (opts: CoreMLLoadModelOptions) => Promise<unknown>;
  unloadModel: () => Promise<void>;
  isLoaded: () => Promise<boolean>;
  generate: (prompt: string, opts?: CoreMLGenerateOptions) => Promise<string>;
};

export type CoreMLLoadModelOptions = {
  modelName?: string;
  modelPath?: string;
  inputIdsName?: string;
  attentionMaskName?: string;
  logitsName?: string;
  computeUnits?: "all" | "cpuOnly" | "cpuAndGPU" | "cpuAndNeuralEngine";
  eosTokenId?: number;
};

export type CoreMLGenerateOptions = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  tokenizer?: {
    vocabJsonAssetPath: string;
    mergesTxtAssetPath: string;
    eosTokenId?: number;
    bosTokenId?: number;
  };
};

export const DEFAULT_COREML_MODEL_NAME = "MyLLM";
export const DEFAULT_COREML_EOS_TOKEN_ID = 50256;

export const DEFAULT_COREML_TOKENIZER = {
  vocabJsonAssetPath: "module:tokenizers/gpt2/vocab.json",
  mergesTxtAssetPath: "module:tokenizers/gpt2/merges.txt",
  eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
} as const;

export const DEFAULT_COREML_LOAD_OPTIONS: CoreMLLoadModelOptions = {
  modelName: DEFAULT_COREML_MODEL_NAME,
  inputIdsName: "input_ids",
  attentionMaskName: "attention_mask",
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
