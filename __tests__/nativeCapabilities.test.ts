jest.mock("expo-audio", () => ({ setAudioModeAsync: jest.fn() }));

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {},
}));

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
  it("returns supported Apple tethered capture commands", () => {
    const commands = buildRviCaptureCommands("00008110-001C195A0E91001E");
    expect(commands[0]).toBe("rvictl -s 00008110-001C195A0E91001E");
    expect(commands[1]).toContain("tcpdump -i rvi0");
    expect(commands[2]).toBe("rvictl -x 00008110-001C195A0E91001E");
  });

  it("throws when udid is missing", () => {
    expect(() => buildRviCaptureCommands(" ")).toThrow(/UDID is required/);
  });

  it("throws when udid has unsafe characters", () => {
    expect(() => buildRviCaptureCommands("foo; rm -rf /")).toThrow(
      /hexadecimal characters and dashes/,
    );
  });
});
