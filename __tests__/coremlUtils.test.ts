import {
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
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

  it("exposes stable default load and generation settings", () => {
    expect(DEFAULT_COREML_LOAD_OPTIONS.modelFile).toBe(
      "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
    );
    expect(DEFAULT_COREML_GENERATE_OPTIONS.tokenizer?.kind).toBe("none");
  });
});
