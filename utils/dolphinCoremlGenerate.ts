import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import { DEFAULT_COREML_LOAD_OPTIONS } from "@/utils/coreml";
import {
  dolphinDecode,
  dolphinEncode,
  dolphinTokenId,
} from "./dolphinTokenizer";

type GenOpts = {
  maxNewTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  repetitionPenalty?: number;
};

let modelLoaded = false;
let stopTokenIdsCache: readonly [number, number] | null = null;
let stopTokenIdsInFlight: Promise<readonly [number, number]> | null = null;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStopTokenIdsWithRetry(
  maxAttempts = 3,
): Promise<readonly [number, number]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [eot, eos] = await Promise.all([
        dolphinTokenId("<|eot_id|>"),
        dolphinTokenId("<|end_of_text|>"),
      ]);
      return [eot, eos] as const;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(150 * attempt);
      }
    }
  }

  throw new Error(
    `Failed to resolve stop token IDs after ${maxAttempts} attempts: ${String(lastError)}`,
  );
}

async function getStopTokenIds(): Promise<readonly [number, number]> {
  if (stopTokenIdsCache) return stopTokenIdsCache;

  if (!stopTokenIdsInFlight) {
    stopTokenIdsInFlight = fetchStopTokenIdsWithRetry();
  }

  try {
    const resolved = await stopTokenIdsInFlight;
    stopTokenIdsCache = resolved;
    return resolved;
  } catch (error) {
    // Do not cache rejection; allow later retries.
    stopTokenIdsInFlight = null;
    throw error;
  } finally {
    if (stopTokenIdsCache) {
      stopTokenIdsInFlight = null;
    }
  }
}

async function ensureModelLoaded() {
  if (modelLoaded) return;
  const loaded = await CoreMLLLM.isLoaded();
  if (!loaded) {
    await CoreMLLLM.loadModel({
      ...DEFAULT_COREML_LOAD_OPTIONS,
      modelFile: "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
      computeUnits: "cpuAndNeuralEngine",
    });
  }
  modelLoaded = true;
}

export async function dolphinCoremlGenerate(
  prompt: string,
  opts: GenOpts = {},
) {
  await ensureModelLoaded();

  const enc = await dolphinEncode(prompt);
  const promptLen = enc.ids.length;

  const [eot, eos] = await getStopTokenIds();

  const outIds: number[] = await CoreMLLLM.generateFromTokens(enc.ids, {
    maxNewTokens: opts.maxNewTokens ?? 192,
    temperature: opts.temperature ?? 0.7,
    topK: opts.topK ?? 40,
    topP: opts.topP ?? 0.95,
    repetitionPenalty: opts.repetitionPenalty ?? 1.05,
    stopTokenIds: [eot, eos],
  });

  const completionIds = outIds.slice(promptLen);
  const completion = await dolphinDecode(completionIds, true);

  return completion.trim();
}
