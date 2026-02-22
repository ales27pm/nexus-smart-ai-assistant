import {
  buildRviCaptureCommands,
  computeEmbedding,
  cosineSimilarity,
} from "../utils/nativeCapabilities";

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
  it("returns supported Apple tethered capture commands", () => {
    const commands = buildRviCaptureCommands("abc-123");
    expect(commands[0]).toBe("rvictl -s abc-123");
    expect(commands[1]).toContain("tcpdump -i rvi0");
    expect(commands[2]).toBe("rvictl -x abc-123");
  });

  it("throws when udid is missing", () => {
    expect(() => buildRviCaptureCommands(" ")).toThrow(/UDID is required/);
  });
});
