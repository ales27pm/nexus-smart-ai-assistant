jest.mock("expo-audio", () => ({ setAudioModeAsync: jest.fn() }));

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {},
}));

import { computeEmbedding, cosineSimilarity } from "../utils/vectorUtils";

describe("nativeCapabilities embeddings", () => {
  it("returns stable embedding dimension", () => {
    const embedding = computeEmbedding(
      "device diagnostics and semantic analysis",
    );
    expect(embedding).toHaveLength(64);
  });

  it("prefers semantically similar sentence in cosine space", () => {
    const a = computeEmbedding("diagnostic capability probe local capture");
    const b = computeEmbedding("capability probe device diagnostics capture");
    const c = computeEmbedding("calendar reminder shopping list");

    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });
});
