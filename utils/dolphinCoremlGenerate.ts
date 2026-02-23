import { CoreMLLLM } from "@/modules/expo-coreml-llm";
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

export async function dolphinCoremlGenerate(
  prompt: string,
  opts: GenOpts = {},
) {
  await CoreMLLLM.loadModel({
    modelFile: "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
    computeUnits: "cpuAndNeuralEngine",
    inputIdsName: "input_ids",
    attentionMaskName: "attention_mask",
    cachePositionName: "cache_position",
    logitsName: "logits",
  });

  const enc = await dolphinEncode(prompt);
  const promptLen = enc.ids.length;

  const eot = await dolphinTokenId("<|eot_id|>");
  const eos = await dolphinTokenId("<|end_of_text|>");

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
