import { generateCoreMLTextStream } from "@/utils/coremlStreamingGenerator";

describe("generateCoreMLTextStream", () => {
  it("streams decoded tokens incrementally", async () => {
    const provider: any = {
      tokenize: jest.fn().mockResolvedValue([101, 102]),
      generateFromTokens: jest
        .fn()
        .mockResolvedValueOnce([201])
        .mockResolvedValueOnce([202])
        .mockResolvedValueOnce([2]),
      decode: jest
        .fn()
        .mockResolvedValueOnce("Hello")
        .mockResolvedValueOnce(" world")
        .mockResolvedValueOnce(""),
    };

    const tokens: string[] = [];
    const out = await generateCoreMLTextStream(
      provider,
      "prompt",
      { maxNewTokens: 10, stopTokenIds: [2], tokenizer: { kind: "gpt2_bpe" } },
      (token) => tokens.push(token),
    );

    expect(out).toBe("Hello world");
    expect(tokens).toEqual(["Hello", " world", ""]);
    expect(provider.generateFromTokens).toHaveBeenCalledTimes(3);
  });

  it("trims context window when maxContext is exceeded", async () => {
    const provider: any = {
      tokenize: jest.fn().mockResolvedValue([10, 11, 12]),
      generateFromTokens: jest
        .fn()
        .mockResolvedValueOnce([13])
        .mockResolvedValueOnce([14]),
      decode: jest.fn().mockResolvedValue("x"),
    };

    await generateCoreMLTextStream(provider, "prompt", {
      maxNewTokens: 2,
      maxContext: 3,
      tokenizer: { kind: "byte_level_bpe" },
      stopTokenIds: [],
    });

    expect(provider.generateFromTokens).toHaveBeenNthCalledWith(
      1,
      [10, 11, 12],
      expect.any(Object),
    );
    expect(provider.generateFromTokens).toHaveBeenNthCalledWith(
      2,
      [11, 12, 13],
      expect.any(Object),
    );
  });
});
