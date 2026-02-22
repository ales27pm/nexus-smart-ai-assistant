import { buildRviCaptureCommands } from "../utils/nativeCapabilities";
import { computeEmbedding, cosineSimilarity } from "../utils/vectorUtils";

describe("nativeCapabilities embeddings", () => {
  it("returns stable embedding dimension", () => {
    const embedding = computeEmbedding(
      "network diagnostics and packet analysis",
    );
    expect(embedding).toHaveLength(64);
  });

  it("prefers semantically similar sentence in cosine space", () => {
    const a = computeEmbedding("diagnostic network probe wifi capture");
    const b = computeEmbedding("wifi probe network diagnostics capture");
    const c = computeEmbedding("calendar reminder shopping list");

    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });
});

describe("buildRviCaptureCommands", () => {
  it.each([
    ["00008110-001C195A0E91001E", "00008110-001C195A0E91001E"],
    ["00008110-001c195a0e91001e", "00008110-001c195a0e91001e"],
    ["00008110-001C195a0e91001e", "00008110-001C195a0e91001e"],
    ["  00008110-001C195A0E91001E  ", "00008110-001C195A0E91001E"],
    ["\t00008110-001c195a0e91001e\n", "00008110-001c195a0e91001e"],
    [" \n00008110-001C195a0e91001e\t", "00008110-001C195a0e91001e"],
    [
      "00008020F66A113A3B88002E5E57A2A9A6CD5D4F",
      "00008020F66A113A3B88002E5E57A2A9A6CD5D4F",
    ],
  ])(
    "returns supported Apple tethered capture commands for UDID %s",
    (inputUdid, normalizedUdid) => {
      const commands = buildRviCaptureCommands(inputUdid);
      expect(commands[0]).toBe(`rvictl -s ${normalizedUdid}`);
      expect(commands[1]).toContain("tcpdump -i rvi0");
      expect(commands[2]).toBe(`rvictl -x ${normalizedUdid}`);
    },
  );

  it("throws when udid is missing", () => {
    expect(() => buildRviCaptureCommands(" ")).toThrow(/UDID is required/);
  });

  it.each(["foo; rm -rf /", "abc_def", "abc/def", "abc def", "xyz"])(
    "throws when udid has invalid characters or malformed format: %s",
    (input) => {
      expect(() => buildRviCaptureCommands(input)).toThrow(
        /hexadecimal characters and dashes/,
      );
    },
  );
});
