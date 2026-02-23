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
const STOP_TOKEN_IDS_PROMISE = Promise.all([
  dolphinTokenId("<|eot_id|>"),
  dolphinTokenId("<|end_of_text|>"),
]);

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

  const [eot, eos] = await STOP_TOKEN_IDS_PROMISE;

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
