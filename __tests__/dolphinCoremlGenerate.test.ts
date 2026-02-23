import { dolphinCoremlGenerate } from "@/utils/dolphinCoremlGenerate";
import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import * as tok from "@/utils/dolphinTokenizer";

jest.mock("@/modules/expo-coreml-llm", () => ({
  CoreMLLLM: {
    loadModel: jest.fn().mockResolvedValue(undefined),
    generateFromTokens: jest.fn().mockResolvedValue([10, 11, 12, 99]),
  },
}));

jest.mock("@/utils/dolphinTokenizer", () => ({
  dolphinEncode: jest.fn().mockResolvedValue({ ids: [10, 11] }),
  dolphinDecode: jest.fn().mockResolvedValue(" completion "),
  dolphinTokenId: jest
    .fn()
    .mockImplementation(async (t: string) =>
      t === "<|eot_id|>" ? 128009 : 128001,
    ),
}));

describe("dolphinCoremlGenerate", () => {
  it("loads model, generates from token ids, and decodes completion only", async () => {
    const out = await dolphinCoremlGenerate("hello", { maxNewTokens: 16 });

    expect(CoreMLLLM.loadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelFile: "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
        cachePositionName: "cache_position",
      }),
    );

    expect(CoreMLLLM.generateFromTokens).toHaveBeenCalledWith(
      [10, 11],
      expect.objectContaining({
        maxNewTokens: 16,
        stopTokenIds: [128009, 128001],
      }),
    );

    expect(tok.dolphinDecode).toHaveBeenCalledWith([12, 99], true);
    expect(out).toBe("completion");
  });
});
