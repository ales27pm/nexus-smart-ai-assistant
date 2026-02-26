import { modelManifest } from "@/utils/modelManifest";
import {
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  CoreMLError,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  normalizeCoreMLError,
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
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.kind).toBe("none");
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
  });
});
