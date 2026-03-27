import { useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { configureAudioForPlayback } from "@/hooks/useAudioRecording";
import type { VoiceState } from "@/hooks/useVoiceAnimations";

const SPEECH_RATE_IOS = 0.52;
const SPEECH_RATE_WEB = 1.0;
const SPEECH_CHUNK_SIZE = 120;

function getSpeechRate(): number {
  if (Platform.OS === "ios") return SPEECH_RATE_IOS;
  return SPEECH_RATE_WEB;
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]+`/g, (m) => m.replace(/`/g, ""))
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function useSpeechSynthesis(
  isActiveRef: React.MutableRefObject<boolean>,
  voiceStateRef: React.MutableRefObject<VoiceState>,
  isMutedRef: React.MutableRefObject<boolean>,
  setVoiceState: (state: VoiceState) => void,
  onFinishSpeaking: () => void,
) {
  const isSpeakingRef = useRef(false);
  const isSpeakingChunkRef = useRef(false);
  const speakQueueRef = useRef<string[]>([]);
  const spokenLengthRef = useRef(0);
  const speechCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRespondingRef = useRef(false);

  const speakText = useCallback(async (cleaned: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!cleaned || !isActiveRef.current) { resolve(); return; }

      isSpeakingChunkRef.current = true;
      if (voiceStateRef.current !== "speaking") setVoiceState("speaking");

      console.log("[VoiceMode] TTS speaking:", cleaned.substring(0, 80));
      let resolved = false;
      const finish = () => { if (!resolved) { resolved = true; resolve(); } };

      const safetyTimeout = setTimeout(() => {
        console.log("[VoiceMode] TTS safety timeout fired");
        finish();
      }, Math.max(15000, cleaned.length * 120));

      Speech.speak(cleaned, {
        language: "en-US",
        pitch: 1.0,
        rate: getSpeechRate(),
        onDone: () => { clearTimeout(safetyTimeout); console.log("[VoiceMode] TTS chunk done"); finish(); },
        onError: (err) => { clearTimeout(safetyTimeout); console.log("[VoiceMode] TTS chunk error:", err); finish(); },
        onStopped: () => { clearTimeout(safetyTimeout); console.log("[VoiceMode] TTS chunk stopped"); finish(); },
      });
    });
  }, [isActiveRef, voiceStateRef, setVoiceState]);

  const processNextChunk = useCallback(async () => {
    if (!isActiveRef.current) return;
    if (speakQueueRef.current.length === 0) {
      isSpeakingChunkRef.current = false;
      if (!prevRespondingRef.current) onFinishSpeaking();
      return;
    }
    const chunk = speakQueueRef.current.shift()!;
    const cleaned = cleanTextForSpeech(chunk);
    if (!cleaned) { await processNextChunk(); return; }

    await configureAudioForPlayback();
    await new Promise((r) => setTimeout(r, 80));
    await speakText(cleaned);

    if (isActiveRef.current) {
      if (speakQueueRef.current.length > 0) await processNextChunk();
      else if (!prevRespondingRef.current) onFinishSpeaking();
    }
  }, [isActiveRef, speakText, onFinishSpeaking]);

  const enqueueSpeechChunk = useCallback((chunk: string) => {
    if (isMutedRef.current) return;
    speakQueueRef.current.push(chunk);
    if (!isSpeakingChunkRef.current) void processNextChunk();
  }, [isMutedRef, processNextChunk]);

  const stopSpeaking = useCallback(() => {
    try {
      void Speech.stop();
      isSpeakingRef.current = false;
      isSpeakingChunkRef.current = false;
      speakQueueRef.current = [];
      if (speechCheckTimerRef.current) {
        clearTimeout(speechCheckTimerRef.current);
        speechCheckTimerRef.current = null;
      }
    } catch (e) {
      console.log("[VoiceMode] Stop speech error:", e);
    }
  }, []);

  const processStreamingText = useCallback((streamingText: string) => {
    if (isMutedRef.current) return;
    if (voiceStateRef.current !== "thinking" && voiceStateRef.current !== "speaking") return;

    const newContent = streamingText.substring(spokenLengthRef.current);
    if (newContent.length < SPEECH_CHUNK_SIZE) return;

    const sentenceEnd = newContent.search(/[.!?]\s/);
    if (sentenceEnd > 20) {
      const chunk = newContent.substring(0, sentenceEnd + 1);
      spokenLengthRef.current += chunk.length;
      enqueueSpeechChunk(chunk);
    } else if (newContent.length > SPEECH_CHUNK_SIZE * 2) {
      const commaEnd = newContent.search(/[,;:]\s/);
      const breakAt = commaEnd > 20 ? commaEnd + 1 : SPEECH_CHUNK_SIZE;
      const chunk = newContent.substring(0, breakAt);
      spokenLengthRef.current += chunk.length;
      enqueueSpeechChunk(chunk);
    }
  }, [isMutedRef, voiceStateRef, enqueueSpeechChunk]);

  const handleResponseComplete = useCallback((responseText: string) => {
    if (responseText) {
      const remaining = responseText.substring(spokenLengthRef.current);
      if (remaining.trim()) {
        console.log("[VoiceMode] Speaking remaining:", remaining.substring(0, 80));
        enqueueSpeechChunk(remaining);
      }
      if (isMutedRef.current && !isSpeakingChunkRef.current) {
        onFinishSpeaking();
      }
    } else {
      onFinishSpeaking();
    }
  }, [enqueueSpeechChunk, isMutedRef, onFinishSpeaking]);

  const resetForNewResponse = useCallback(() => {
    spokenLengthRef.current = 0;
    speakQueueRef.current = [];
  }, []);

  return {
    stopSpeaking,
    enqueueSpeechChunk,
    processStreamingText,
    handleResponseComplete,
    resetForNewResponse,
    prevRespondingRef,
    isSpeakingRef,
    isSpeakingChunkRef,
    spokenLengthRef,
  };
}
