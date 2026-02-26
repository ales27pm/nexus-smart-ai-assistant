export type SilenceDetectionInput = {
  level: number;
  elapsedMs: number;
  minRecordingMs: number;
  silenceThreshold: number;
  silenceDurationMs: number;
  meteringIntervalMs: number;
  hadSpeech: boolean;
  consecutiveSilentFrames: number;
};

export type SilenceDetectionResult = {
  consecutiveSilentFrames: number;
  shouldStop: boolean;
};

export function detectSilence({
  level,
  elapsedMs,
  minRecordingMs,
  silenceThreshold,
  silenceDurationMs,
  meteringIntervalMs,
  hadSpeech,
  consecutiveSilentFrames,
}: SilenceDetectionInput): SilenceDetectionResult {
  const silenceFramesNeeded = Math.max(
    1,
    Math.ceil(silenceDurationMs / meteringIntervalMs),
  );

  if (elapsedMs <= minRecordingMs) {
    return { consecutiveSilentFrames: 0, shouldStop: false };
  }

  if (level >= silenceThreshold) {
    return { consecutiveSilentFrames: 0, shouldStop: false };
  }

  const nextFrames = consecutiveSilentFrames + 1;
  return {
    consecutiveSilentFrames: nextFrames,
    shouldStop: hadSpeech && nextFrames >= silenceFramesNeeded,
  };
}
