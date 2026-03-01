import { modelManifest } from "@/utils/modelManifest";
import {
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  CoreMLError,
  DEFAULT_COREML_BOS_TOKEN_ID,
  DEFAULT_COREML_EOS_TOKEN_ID,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  DEFAULT_COREML_TOKENIZER_MERGES_PATH,
  DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
  normalizeCoreMLError,
  toActionableCoreMLError,
} from "@/utils/coreml";

describe("coreml utils", () => {
  it("builds a deterministic chat prompt", () => {
    expect(buildCoreMLChatPrompt("system", "hello")).toBe(
      "system\n\nUser: hello\nAssistant:",
    );
  });

  it("removes the prompt prefix and trims leading spaces", () => {
    const prompt = buildCoreMLChatPrompt("sys", "user");
    expect(cleanCoreMLOutput(`${prompt}   response`, prompt)).toBe("response");
  });

  it("returns fallback text when output is empty after trimming", () => {
    const prompt = buildCoreMLChatPrompt("sys", "user");
    expect(cleanCoreMLOutput(`${prompt}    `, prompt)).toBe("(no output)");
  });

  it("exposes stable manifest-driven default settings", () => {
    expect(DEFAULT_COREML_LOAD_OPTIONS.modelFile).toBe(
      modelManifest.activeModel,
    );
    expect(DEFAULT_COREML_LOAD_OPTIONS.eosTokenId).toBe(
      modelManifest.eosTokenId,
    );
    expect(DEFAULT_COREML_LOAD_OPTIONS.computeUnits).toBe(
      modelManifest.computeUnits,
    );
    expect(DEFAULT_COREML_LOAD_OPTIONS.maxContext).toBe(
      modelManifest.contextLimit,
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.stopTokenIds).toEqual([
      ...modelManifest.stopTokenIds,
    ]);
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.kind).toBe(
      "byte_level_bpe",
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.vocabJsonAssetPath).toBe(
      DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.mergesTxtAssetPath).toBe(
      DEFAULT_COREML_TOKENIZER_MERGES_PATH,
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.bosTokenId).toBe(
      DEFAULT_COREML_BOS_TOKEN_ID,
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.eosTokenId).toBe(
      DEFAULT_COREML_EOS_TOKEN_ID,
    );
  });

  describe("normalizeCoreMLError", () => {
    it("returns the same instance when given a CoreMLError", () => {
      const original = new CoreMLError("initial failure", 999);
      const normalized = normalizeCoreMLError(original);

      expect(normalized).toBe(original);
      expect(normalized).toBeInstanceOf(CoreMLError);
    });

    it("wraps plain Error without code into CoreMLError with undefined code", () => {
      const error = new Error("plain failure");
      const normalized = normalizeCoreMLError(error);

      expect(normalized).toBeInstanceOf(CoreMLError);
      expect(normalized.message).toBe("plain failure");
      expect(normalized.code).toBeUndefined();
    });

    it("propagates numeric error code from Error to CoreMLError", () => {
      const error = new Error("coded failure") as Error & { code: number };
      error.code = 1234;

      const normalized = normalizeCoreMLError(error);

      expect(normalized).toBeInstanceOf(CoreMLError);
      expect(normalized.code).toBe(1234);
    });

    it("maps CoreML execution-plan build failures from native -4 code to app code 104", () => {
      const error = new Error(
        "Failed to build the model execution plan using model.mil with error code: -4.",
      ) as Error & { code: number };
      error.code = -4;

      const normalized = normalizeCoreMLError(error);

      expect(normalized).toBeInstanceOf(CoreMLError);
      expect(normalized.code).toBe(104);
    });

    it("maps execution-plan failure messages to app code 104 even without native code", () => {
      const error = new Error(
        "Failed to build the model execution plan using a model architecture file.",
      );

      const normalized = normalizeCoreMLError(error);

      expect(normalized).toBeInstanceOf(CoreMLError);
      expect(normalized.code).toBe(104);
    });

    it("maps model-not-loaded failures to app code 20", () => {
      const error = new Error("Load the CoreML model first");

      const normalized = normalizeCoreMLError(error);
      const actionable = toActionableCoreMLError(error);

      expect(normalized).toBeInstanceOf(CoreMLError);
      expect(normalized.code).toBe(20);
      expect(actionable.message).toContain("No CoreML model selected");
    });

    it("handles non-Error inputs", () => {
      const normalizedFromString = normalizeCoreMLError("string failure");
      expect(normalizedFromString).toBeInstanceOf(CoreMLError);
      expect(normalizedFromString.message).toBe("string failure");
      expect(normalizedFromString.code).toBeUndefined();

      const normalizedFromObject = normalizeCoreMLError({ reason: "nope" });
      expect(normalizedFromObject).toBeInstanceOf(CoreMLError);
      expect(normalizedFromObject.message).toBe("Unknown CoreML failure");
      expect(normalizedFromObject.code).toBeUndefined();
    });

    it("adds actionable hint for max token limit error code 10", () => {
      const actionable = toActionableCoreMLError(
        new CoreMLError("generation failed", 10),
      );

      expect(actionable.code).toBe(10);
      expect(actionable.message).toContain("resource bundle missing");
    });

    it("adds actionable hint for context errors in the 20 range", () => {
      const actionable = toActionableCoreMLError(
        new CoreMLError("generation failed", 20),
      );

      expect(actionable.code).toBe(20);
      expect(actionable.message).toContain("No CoreML model selected");
    });

    it("adds actionable hint for execution plan errors", () => {
      const actionable = toActionableCoreMLError(
        new CoreMLError("model load failed", 104),
      );

      expect(actionable.code).toBe(104);
      expect(actionable.message).toContain("execution-plan build failed");
    });

    it("adds actionable hint for tokenizer errors in the 120 range", () => {
      const actionable = toActionableCoreMLError(
        new CoreMLError("generation failed", 120),
      );

      expect(actionable.code).toBe(120);
      expect(actionable.message).toContain("byte_level_bpe or gpt2_bpe");
    });
  });
});
