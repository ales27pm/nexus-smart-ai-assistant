import {
  CoreMLGenerateOptions,
  DEFAULT_COREML_GENERATE_OPTIONS,
  cleanCoreMLOutput,
} from "@/utils/coreml";
import { ICoreMLProvider } from "@/utils/coremlProvider";

type GenOpts = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
  history?: string[];
  tokenizer?: CoreMLGenerateOptions["tokenizer"];
};

function normalizeTokenizerKind(tokenizer: GenOpts["tokenizer"]) {
  if (!tokenizer) return tokenizer;
  if (tokenizer.kind === "gpt2_bpe") {
    return { ...tokenizer, kind: "byte_level_bpe" as const };
  }
  return tokenizer;
}

function buildPrompt(prompt: string, history?: string[]): string {
  if (!history?.length) return prompt;
  return `${history.join("\n")}\n${prompt}`;
}

function buildGenerationOptions(opts: GenOpts): CoreMLGenerateOptions {
  return {
    maxNewTokens:
      opts.maxNewTokens ?? DEFAULT_COREML_GENERATE_OPTIONS.maxNewTokens,
    temperature:
      opts.temperature ?? DEFAULT_COREML_GENERATE_OPTIONS.temperature,
    topK: opts.topK ?? DEFAULT_COREML_GENERATE_OPTIONS.topK,
    topP: opts.topP ?? DEFAULT_COREML_GENERATE_OPTIONS.topP,
    repetitionPenalty:
      opts.repetitionPenalty ??
      DEFAULT_COREML_GENERATE_OPTIONS.repetitionPenalty,
    stopTokenIds: DEFAULT_COREML_GENERATE_OPTIONS.stopTokenIds,
    tokenizer:
      normalizeTokenizerKind(opts.tokenizer) ??
      DEFAULT_COREML_GENERATE_OPTIONS.tokenizer,
    seed: DEFAULT_COREML_GENERATE_OPTIONS.seed,
  };
}

export async function dolphinCoremlGenerate(
  provider: ICoreMLProvider,
  prompt: string,
  opts: GenOpts = {},
) {
  const joinedPrompt = buildPrompt(prompt, opts.history);
  const rawOutput = await provider.generate(
    joinedPrompt,
    buildGenerationOptions(opts),
  );
  return cleanCoreMLOutput(rawOutput, joinedPrompt);
}
