import { dolphinCoremlGenerate } from "@/utils/dolphinCoremlGenerate";
import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import * as tok from "@/utils/dolphinTokenizer";

jest.mock("@/modules/expo-coreml-llm", () => ({
  CoreMLLLM: {
    isLoaded: jest.fn().mockResolvedValue(false),
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it("uses multi-turn history and trims prompt ids to maxContext", async () => {
    (tok.dolphinEncode as jest.Mock).mockResolvedValueOnce({
      ids: [1, 2, 3, 4, 5, 6],
    });
    (CoreMLLLM.generateFromTokens as jest.Mock).mockResolvedValueOnce([
      3, 4, 5, 6, 7, 8,
    ]);

    await dolphinCoremlGenerate("latest", {
      history: ["user: hi", "assistant: hello", "user: follow up"],
      maxContext: 4,
      maxNewTokens: 8,
    });

    expect(tok.dolphinEncode).toHaveBeenCalledWith(
      "user: hi\nassistant: hello\nuser: follow up\nlatest",
    );
    expect(CoreMLLLM.generateFromTokens).toHaveBeenCalledWith(
      [3, 4, 5, 6],
      expect.objectContaining({ maxNewTokens: 8 }),
    );
    expect(tok.dolphinDecode).toHaveBeenCalledWith([7, 8], true);
  });
});
