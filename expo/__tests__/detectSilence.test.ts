import { detectSilence } from "@/utils/detectSilence";

describe("detectSilence", () => {
  const base = {
    elapsedMs: 2500,
    minRecordingMs: 1200,
    silenceThreshold: -35,
    silenceDurationMs: 2000,
    meteringIntervalMs: 200,
    hadSpeech: true,
    consecutiveSilentFrames: 0,
  };

  it("does not stop before min recording duration", () => {
    const result = detectSilence({
      ...base,
      elapsedMs: 500,
      level: -50,
    });

    expect(result.shouldStop).toBe(false);
    expect(result.consecutiveSilentFrames).toBe(0);
  });

  it("resets silent frames when above threshold", () => {
    const result = detectSilence({
      ...base,
      consecutiveSilentFrames: 3,
      level: -20,
    });

    expect(result.shouldStop).toBe(false);
    expect(result.consecutiveSilentFrames).toBe(0);
  });

  it("stops when enough silent frames after speech", () => {
    const result = detectSilence({
      ...base,
      consecutiveSilentFrames: 9,
      level: -45,
    });

    expect(result.shouldStop).toBe(true);
    expect(result.consecutiveSilentFrames).toBe(10);
  });

  it("does not stop when no speech was detected", () => {
    const result = detectSilence({
      ...base,
      hadSpeech: false,
      consecutiveSilentFrames: 9,
      level: -45,
    });

    expect(result.shouldStop).toBe(false);
    expect(result.consecutiveSilentFrames).toBe(10);
  });
});
