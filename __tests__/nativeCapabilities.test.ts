jest.mock("expo-audio", () => ({ setAudioModeAsync: jest.fn() }));

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {},
}));

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
