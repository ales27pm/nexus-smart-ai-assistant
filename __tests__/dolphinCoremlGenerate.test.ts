import { dolphinCoremlGenerate } from "@/utils/dolphinCoremlGenerate";
import { ICoreMLProvider } from "@/utils/coremlProvider";
import {
  DEFAULT_COREML_BOS_TOKEN_ID,
  DEFAULT_COREML_EOS_TOKEN_ID,
  DEFAULT_COREML_TOKENIZER_MERGES_PATH,
  DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
} from "@/utils/coreml";
import { modelManifest } from "@/utils/modelManifest";

describe("dolphinCoremlGenerate", () => {
  const provider: ICoreMLProvider = {
    load: jest.fn(),
    unload: jest.fn(),
    cancel: jest.fn(),
    isLoaded: jest.fn(),
    generate: jest.fn().mockResolvedValue("prompt completion "),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses provider.generate and strips prompt prefix", async () => {
    const out = await dolphinCoremlGenerate(provider, "prompt", {
      maxNewTokens: 16,
      temperature: 0.2,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      "prompt",
      expect.objectContaining({
        maxNewTokens: 16,
        temperature: 0.2,
        stopTokenIds: [...modelManifest.stopTokenIds],
        tokenizer: expect.objectContaining({
          kind: "byte_level_bpe",
          vocabJsonAssetPath: DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
          mergesTxtAssetPath: DEFAULT_COREML_TOKENIZER_MERGES_PATH,
          bosTokenId: DEFAULT_COREML_BOS_TOKEN_ID,
          eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
        }),
      }),
    );
    expect(out).toBe("completion");
  });

  it("uses explicit tokenizer asset paths and BOS/EOS IDs when provided", async () => {
    const customTokenizer = {
      kind: "byte_level_bpe" as const,
      vocabJsonAssetPath: "module:tokenizers/custom/vocab.json",
      mergesTxtAssetPath: "module:tokenizers/custom/merges.txt",
      bosTokenId: 50256,
      eosTokenId: 50256,
    };

    await dolphinCoremlGenerate(provider, "prompt", {
      tokenizer: customTokenizer,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      "prompt",
      expect.objectContaining({
        tokenizer: expect.objectContaining(customTokenizer),
      }),
    );
  });

  it("accepts gpt2_bpe tokenizer configs without normalization", async () => {
    const legacyTokenizer = {
      kind: "gpt2_bpe" as const,
      vocabJsonAssetPath: "module:tokenizers/gpt2/gpt2-vocab.json",
      mergesTxtAssetPath: "module:tokenizers/gpt2/gpt2-merges.txt",
      bosTokenId: 777,
      eosTokenId: 888,
    };

    await dolphinCoremlGenerate(provider, "prompt", {
      tokenizer: legacyTokenizer,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      "prompt",
      expect.objectContaining({
        tokenizer: expect.objectContaining(legacyTokenizer),
      }),
    );
  });

  it("joins history into prompt", async () => {
    await dolphinCoremlGenerate(provider, "latest", {
      history: ["user: hi", "assistant: hello"],
    });

    expect(provider.generate).toHaveBeenCalledWith(
      "user: hi\nassistant: hello\nlatest",
      expect.any(Object),
    );
  });
});
