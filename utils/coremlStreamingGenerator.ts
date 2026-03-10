import {
  CoreMLError,
  CoreMLGenerateOptions,
  DEFAULT_COREML_GENERATE_OPTIONS,
} from "@/utils/coreml";
import { ICoreMLProvider } from "@/utils/coremlProvider";

export type CoreMLStreamingGenerateOptions = CoreMLGenerateOptions & {
  maxContext?: number;
  stopSequences?: string[];
};

const DEFAULT_MAX_CONTEXT = 2048;

export async function generateCoreMLTextStream(
  provider: ICoreMLProvider,
  prompt: string,
  options: CoreMLStreamingGenerateOptions = {},
  onToken?: (token: string) => void,
): Promise<string> {
  const tokenizer =
    options.tokenizer ?? DEFAULT_COREML_GENERATE_OPTIONS.tokenizer;

  if (!tokenizer || tokenizer.kind === "none") {
    throw new CoreMLError(
      "Streaming generation requires a tokenizer configuration.",
      122,
    );
  }

  const maxNewTokens =
    options.maxNewTokens ?? DEFAULT_COREML_GENERATE_OPTIONS.maxNewTokens ?? 220;
  const stopTokenIds =
    options.stopTokenIds ?? DEFAULT_COREML_GENERATE_OPTIONS.stopTokenIds ?? [];
  const maxContext = options.maxContext ?? DEFAULT_MAX_CONTEXT;
  const stopSequences = options.stopSequences ?? [];

  const promptTokenIds = await provider.tokenize(prompt, tokenizer);
  const generatedTokens: number[] = [];
  let emittedText = "";

  const generationOptions = {
    maxNewTokens: 1,
    temperature: options.temperature,
    topK: options.topK,
    topP: options.topP,
    repetitionPenalty: options.repetitionPenalty,
    seed: options.seed,
    maxContext,
  };

  const canUseIncrementalSession =
    typeof provider.beginGenerationSession === "function" &&
    typeof provider.generateNextToken === "function";

  const incrementalSessionEnabled = canUseIncrementalSession
    ? await provider.beginGenerationSession?.({
        promptTokenIds,
        maxContext,
        generation: generationOptions,
      })
    : false;

  try {
    for (let i = 0; i < maxNewTokens; i += 1) {
      let nextToken: number | undefined;

      if (incrementalSessionEnabled) {
        nextToken = (await provider.generateNextToken?.()) ?? undefined;
      } else {
        const contextWindow = [...promptTokenIds, ...generatedTokens];
        const trimmedContext =
          contextWindow.length > maxContext
            ? contextWindow.slice(contextWindow.length - maxContext)
            : contextWindow;

        const tokenBatch = await provider.generateFromTokens(
          trimmedContext,
          generationOptions,
        );

        if (!Array.isArray(tokenBatch) || tokenBatch.length === 0) {
          break;
        }

        nextToken = tokenBatch[tokenBatch.length - 1];
      }

      if (typeof nextToken !== "number") {
        break;
      }

      generatedTokens.push(nextToken);

      const decodedToken = await provider.decode([nextToken], tokenizer);
      emittedText += decodedToken;
      onToken?.(decodedToken);

      if (stopTokenIds.includes(nextToken)) {
        break;
      }

      if (stopSequences.some((sequence) => emittedText.includes(sequence))) {
        break;
      }
    }
  } finally {
    if (incrementalSessionEnabled) {
      await provider.endGenerationSession?.();
    }
  }

  return emittedText.trimEnd();
}
