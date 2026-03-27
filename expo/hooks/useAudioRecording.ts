import { useRef, useCallback } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { detectSilence } from "@/utils/detectSilence";

const SILENCE_THRESHOLD_NATIVE = -35;
const SILENCE_DURATION_MS = 2000;
const MIN_RECORDING_MS = 1200;
const MAX_RECORDING_MS = 60000;
const WEB_SILENCE_AVG_THRESHOLD = 12;
const MIN_PEAK_LEVEL_NATIVE = -40;
const MIN_PEAK_LEVEL_WEB = 12;
const METERING_INTERVAL = 150;

async function configureAudioForRecording(): Promise<void> {
  if (Platform.OS === "web") return;
  console.log("[VoiceMode] Configuring audio for RECORDING");
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}

export async function configureAudioForPlayback(): Promise<void> {
  if (Platform.OS === "web") return;
  console.log("[VoiceMode] Configuring audio for PLAYBACK");
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
}

export interface RecordingResult {
  formData: FormData;
  hadSpeech: boolean;
}

export function useAudioRecording(
  isActiveRef: React.MutableRefObject<boolean>,
  onRecordingComplete: (result: RecordingResult | null) => void,
  setMicLevel: (level: number) => void,
) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartTime = useRef<number>(0);
  const peakLevelRef = useRef(0);
  const hadSpeechRef = useRef(false);
  const hasNativeMeteringFatalErrorRef = useRef(false);

  const cleanup = useCallback(() => {
    if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
    if (webLevelIntervalRef.current) { clearInterval(webLevelIntervalRef.current); webLevelIntervalRef.current = null; }
    if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }
    if (recordingRef.current) {
      try { void recordingRef.current.stopAndUnloadAsync().catch(() => {}); } catch (e) { console.warn("[VoiceMode] Non-fatal cleanup", e); }
      recordingRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (e) { console.warn("[VoiceMode] Non-fatal cleanup", e); }
      mediaRecorderRef.current = null;
    }
    if (audioContextRef.current) {
      try { void audioContextRef.current.close(); } catch (e) { console.warn("[VoiceMode] Non-fatal cleanup", e); }
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setMicLevel(0);
  }, [setMicLevel]);

  const stopAndTranscribeNative = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
      if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }
      setMicLevel(0);

      console.log("[VoiceMode] Stopping native recording, peak:", peakLevelRef.current.toFixed(1), "hadSpeech:", hadSpeechRef.current);
      await recording.stopAndUnloadAsync();
      recordingRef.current = null;
      await configureAudioForPlayback();

      const uri = recording.getURI();
      if (!uri || !hadSpeechRef.current) {
        console.log("[VoiceMode] No URI or no speech detected");
        onRecordingComplete(null);
        return;
      }

      const uriParts = uri.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const formData = new FormData();
      formData.append("audio", { uri, name: `recording.${fileType}`, type: `audio/${fileType}` } as any);
      onRecordingComplete({ formData, hadSpeech: hadSpeechRef.current });
    } catch (e) {
      console.log("[VoiceMode] Native stop error:", e);
      onRecordingComplete(null);
    }
  }, [onRecordingComplete, setMicLevel]);

  const stopAndTranscribeWeb = useCallback(async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") return;
      setMicLevel(0);
      if (webLevelIntervalRef.current) { clearInterval(webLevelIntervalRef.current); webLevelIntervalRef.current = null; }
      if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
      if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }

      console.log("[VoiceMode] Stopping web recording, peak:", peakLevelRef.current.toFixed(1), "hadSpeech:", hadSpeechRef.current);

      if (!hadSpeechRef.current) {
        if (audioContextRef.current) { try { void audioContextRef.current.close(); } catch (e) { console.warn("[VoiceMode] Non-fatal", e); } audioContextRef.current = null; analyserRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        try { mediaRecorder.stop(); } catch (e) { console.warn("[VoiceMode] Non-fatal", e); }
        mediaRecorderRef.current = null;
        onRecordingComplete(null);
        return;
      }

      return new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (audioContextRef.current) { try { void audioContextRef.current.close(); } catch (e) { console.warn("[VoiceMode] Non-fatal", e); } audioContextRef.current = null; analyserRef.current = null; }
          if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
          mediaRecorderRef.current = null;

          if (blob.size < 1000) {
            console.log("[VoiceMode] Audio too short");
            onRecordingComplete(null);
            resolve();
            return;
          }

          const file = new File([blob], "recording.webm", { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", file);
          onRecordingComplete({ formData, hadSpeech: hadSpeechRef.current });
          resolve();
        };
        mediaRecorder.stop();
      });
    } catch (e) {
      console.log("[VoiceMode] Web stop error:", e);
      onRecordingComplete(null);
    }
  }, [onRecordingComplete, setMicLevel]);

  const startNative = useCallback(async (): Promise<boolean> => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return false;

      await configureAudioForRecording();
      hasNativeMeteringFatalErrorRef.current = false;
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
          linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false,
        },
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
        },
        web: {},
      });
      await recording.startAsync();
      recordingRef.current = recording;
      recordingStartTime.current = Date.now();
      peakLevelRef.current = -160;
      hadSpeechRef.current = false;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      maxRecordingTimerRef.current = setTimeout(() => {
        console.log("[VoiceMode] Max recording time reached");
        if (recordingRef.current) void stopAndTranscribeNative();
      }, MAX_RECORDING_MS);

      let consecutiveSilentFrames = 0;
      meteringIntervalRef.current = setInterval(async () => {
        try {
          if (!recordingRef.current) return;
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording) return;
          const metering = status.metering ?? -160;
          const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
          setMicLevel(normalized);
          if (metering > peakLevelRef.current) peakLevelRef.current = metering;
          if (metering > MIN_PEAK_LEVEL_NATIVE) hadSpeechRef.current = true;

          const elapsed = Date.now() - recordingStartTime.current;
          const silence = detectSilence({
            level: metering, elapsedMs: elapsed, minRecordingMs: MIN_RECORDING_MS,
            silenceThreshold: SILENCE_THRESHOLD_NATIVE, silenceDurationMs: SILENCE_DURATION_MS,
            meteringIntervalMs: METERING_INTERVAL, hadSpeech: hadSpeechRef.current, consecutiveSilentFrames,
          });
          consecutiveSilentFrames = silence.consecutiveSilentFrames;
          if (silence.shouldStop) {
            console.log("[VoiceMode] Silence after speech, peak:", peakLevelRef.current.toFixed(1));
            if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
            void stopAndTranscribeNative();
          }
        } catch (error) {
          if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
          console.warn("[VoiceMode] Native metering error", error);
        }
      }, METERING_INTERVAL);
      console.log("[VoiceMode] Native recording started");
      return true;
    } catch (e) {
      console.log("[VoiceMode] Native start error:", e);
      return false;
    }
  }, [stopAndTranscribeNative, setMicLevel]);

  const startWeb = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTime.current = Date.now();
      peakLevelRef.current = 0;
      hadSpeechRef.current = false;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      maxRecordingTimerRef.current = setTimeout(() => {
        console.log("[VoiceMode] Max recording time reached (web)");
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") void stopAndTranscribeWeb();
      }, MAX_RECORDING_MS);

      let consecutiveSilentFrames = 0;
      webLevelIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(1, avg / 128);
        setMicLevel(normalized);
        if (avg > peakLevelRef.current) peakLevelRef.current = avg;
        if (avg > MIN_PEAK_LEVEL_WEB) hadSpeechRef.current = true;
      }, 50);

      meteringIntervalRef.current = setInterval(() => {
        try {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const elapsed = Date.now() - recordingStartTime.current;
          const silence = detectSilence({
            level: avg, elapsedMs: elapsed, minRecordingMs: MIN_RECORDING_MS,
            silenceThreshold: WEB_SILENCE_AVG_THRESHOLD, silenceDurationMs: SILENCE_DURATION_MS,
            meteringIntervalMs: METERING_INTERVAL, hadSpeech: hadSpeechRef.current, consecutiveSilentFrames,
          });
          consecutiveSilentFrames = silence.consecutiveSilentFrames;
          if (silence.shouldStop) {
            console.log("[VoiceMode] Web silence after speech, peak:", peakLevelRef.current.toFixed(1));
            if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
            void stopAndTranscribeWeb();
          }
        } catch (error) {
          console.warn("[VoiceMode] Web metering error", error);
        }
      }, METERING_INTERVAL);
      console.log("[VoiceMode] Web recording started");
      return true;
    } catch (e) {
      console.log("[VoiceMode] Web start error:", e);
      return false;
    }
  }, [stopAndTranscribeWeb, setMicLevel]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return startWeb();
    return startNative();
  }, [startNative, startWeb]);

  const stopRecording = useCallback(() => {
    if (Platform.OS === "web") void stopAndTranscribeWeb();
    else void stopAndTranscribeNative();
  }, [stopAndTranscribeNative, stopAndTranscribeWeb]);

  return { startRecording, stopRecording, cleanup };
}
