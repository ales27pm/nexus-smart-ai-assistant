import { useRef, useCallback } from "react";

const STT_URL = "https://toolkit.rork.com/stt/transcribe/";
const TRANSCRIPTION_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

const NOISE_WORDS = new Set([
  "", ".", "..", "...", ",", "!", "?", "you", "the", "a", "an",
  "um", "uh", "ah", "oh", "hm", "hmm", "mhm", "er", "erm",
  "bye", "bye.", "thanks.", "thank you.",
]);

export function useTranscription() {
  const transcriptionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcribeAudio = useCallback(
    async (formData: FormData, attempt: number = 0): Promise<string | null> => {
      try {
        console.log("[VoiceMode] Transcribing (attempt", attempt + 1, ")...");
        const controller = new AbortController();
        transcriptionTimeoutRef.current = setTimeout(() => {
          controller.abort();
        }, TRANSCRIPTION_TIMEOUT_MS);

        const response = await fetch(STT_URL, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (transcriptionTimeoutRef.current) {
          clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = null;
        }

        if (!response.ok) {
          console.log("[VoiceMode] STT error:", response.status);
          if (attempt < MAX_RETRIES) return transcribeAudio(formData, attempt + 1);
          return null;
        }
        const data = await response.json();
        console.log("[VoiceMode] Transcribed:", data.text?.substring(0, 100));
        return data.text || null;
      } catch (e: unknown) {
        if (transcriptionTimeoutRef.current) {
          clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = null;
        }
        const isAbort = e instanceof Error && e.name === "AbortError";
        console.log("[VoiceMode] Transcription error:", isAbort ? "timeout" : e);
        if (!isAbort && attempt < MAX_RETRIES) return transcribeAudio(formData, attempt + 1);
        return null;
      }
    },
    [],
  );

  const isNoiseTranscription = useCallback((text: string): boolean => {
    const trimmed = text.trim().toLowerCase().replace(/[.!?,;:]+$/, "").trim();
    if (trimmed.length < 2) return true;
    if (NOISE_WORDS.has(trimmed)) return true;
    if (/^[\s.,!?;:]+$/.test(trimmed)) return true;
    if (/^\W+$/.test(trimmed)) return true;
    if (trimmed.split(/\s+/).length <= 1 && trimmed.length < 4) return true;
    const noisePatterns = [
      /^(um+|uh+|ah+|oh+|hm+|hmm+|mhm+|er+|erm+)$/i,
      /^(okay|ok|yeah|yep|nope|hey|hi|huh|wow)$/i,
    ];
    for (const pattern of noisePatterns) {
      if (pattern.test(trimmed)) return true;
    }
    return false;
  }, []);

  const cleanup = useCallback(() => {
    if (transcriptionTimeoutRef.current) {
      clearTimeout(transcriptionTimeoutRef.current);
      transcriptionTimeoutRef.current = null;
    }
  }, []);

  return { transcribeAudio, isNoiseTranscription, cleanup };
}
