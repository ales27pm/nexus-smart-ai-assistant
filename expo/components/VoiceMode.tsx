import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  Dimensions,
  ScrollView,
} from "react-native";
import { X, Mic, Volume2, VolumeX, ChevronDown } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useVoiceAnimations, VoiceState } from "@/hooks/useVoiceAnimations";
import { useAudioRecording, configureAudioForPlayback, RecordingResult } from "@/hooks/useAudioRecording";
import { useTranscription } from "@/hooks/useTranscription";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const ORB_SIZE = 160;
const AUTO_LISTEN_DELAY = 700;
const POST_SPEAK_LISTEN_DELAY = 600;

interface VoiceTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface VoiceModeProps {
  visible: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  isResponding: boolean;
  lastAssistantText: string;
  streamingText?: string;
}

export default function VoiceMode({
  visible,
  onClose,
  onSend,
  isResponding,
  lastAssistantText,
  streamingText,
}: VoiceModeProps) {
  const insets = useSafeAreaInsets();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const isActiveRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>("idle");
  const isMutedRef = useRef(false);
  const retryCountRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResponseTextRef = useRef("");

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const anim = useVoiceAnimations(voiceState);
  const { transcribeAudio, isNoiseTranscription, cleanup: cleanupTranscription } = useTranscription();

  const addTurn = useCallback((role: "user" | "assistant", text: string) => {
    setTurns((prev) => [...prev, { role, text, timestamp: Date.now() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const startListeningFn = useRef<() => void>(() => {});

  const finishSpeakingCycle = useCallback(() => {
    console.log("[VoiceMode] Finishing speaking cycle");
    setVoiceState("idle");
    setDisplayText("");
    setTimeout(() => {
      if (isActiveRef.current) startListeningFn.current();
    }, POST_SPEAK_LISTEN_DELAY);
  }, []);

  const speech = useSpeechSynthesis(
    isActiveRef, voiceStateRef, isMutedRef, setVoiceState, finishSpeakingCycle,
  );

  const handleTranscriptReady = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      console.log("[VoiceMode] Empty transcript, restarting");
      if (isActiveRef.current) {
        setErrorText("Didn't catch that. Try again.");
        setTimeout(() => { setErrorText(""); if (isActiveRef.current) startListeningFn.current(); }, 1200);
      }
      return;
    }
    if (isNoiseTranscription(trimmed)) {
      console.log("[VoiceMode] Noise transcription filtered:", trimmed);
      if (isActiveRef.current) setTimeout(() => { if (isActiveRef.current) startListeningFn.current(); }, 400);
      return;
    }
    retryCountRef.current = 0;
    setTranscript(trimmed);
    setDisplayText(trimmed);
    addTurn("user", trimmed);
    setVoiceState("thinking");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log("[VoiceMode] Sending to AI:", trimmed.substring(0, 80));
    onSend(trimmed);
  }, [onSend, addTurn, isNoiseTranscription]);

  const handleTranscriptionFailure = useCallback(() => {
    retryCountRef.current++;
    if (retryCountRef.current >= 3) {
      setErrorText("Voice recognition unavailable. Try again later.");
      setVoiceState("idle");
      setTimeout(() => setErrorText(""), 3000);
    } else {
      setErrorText("Could not understand. Try again.");
      setTimeout(() => { setErrorText(""); if (isActiveRef.current) startListeningFn.current(); }, 1500);
    }
  }, []);

  const onRecordingComplete = useCallback(async (result: RecordingResult | null) => {
    if (!result) {
      if (isActiveRef.current) {
        setVoiceState("idle");
        setTimeout(() => { if (isActiveRef.current) startListeningFn.current(); }, 400);
      }
      return;
    }
    setVoiceState("processing");
    setDisplayText("");
    const text = await transcribeAudio(result.formData);
    if (text) handleTranscriptReady(text);
    else handleTranscriptionFailure();
  }, [transcribeAudio, handleTranscriptReady, handleTranscriptionFailure]);

  const recording = useAudioRecording(isActiveRef, onRecordingComplete, setMicLevel);

  const startListening = useCallback(() => {
    if (!isActiveRef.current) return;
    if (speech.isSpeakingRef.current || speech.isSpeakingChunkRef.current) speech.stopSpeaking();
    void recording.startRecording();
    setVoiceState("listening");
    setDisplayText("");
    setErrorText("");
  }, [recording, speech]);

  startListeningFn.current = startListening;

  const handleOrbPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (voiceState === "speaking") {
      speech.stopSpeaking();
      setVoiceState("idle");
      setDisplayText("");
      setTimeout(() => { if (isActiveRef.current) startListening(); }, 300);
      return;
    }
    if (voiceState === "thinking") return;
    if (voiceState === "idle") startListening();
    else if (voiceState === "listening") recording.stopRecording();
  }, [voiceState, startListening, recording, speech]);

  const handleClose = useCallback(() => {
    Animated.timing(anim.fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      speech.stopSpeaking();
      if (autoStartTimerRef.current) { clearTimeout(autoStartTimerRef.current); autoStartTimerRef.current = null; }
      cleanupTranscription();
      recording.cleanup();
      anim.stopAllAnims();
      configureAudioForPlayback().catch(() => {});
      onClose();
    });
  }, [anim, speech, recording, cleanupTranscription, onClose]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (newMuted && (speech.isSpeakingRef.current || speech.isSpeakingChunkRef.current)) {
      speech.stopSpeaking();
      setVoiceState("idle");
      setDisplayText("");
      setTimeout(() => { if (isActiveRef.current) startListening(); }, 400);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted, speech, startListening]);

  const toggleHistory = useCallback(() => {
    const next = !showHistory;
    setShowHistory(next);
    Animated.timing(anim.historyOpacity, { toValue: next ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [showHistory, anim.historyOpacity]);

  useEffect(() => {
    if (visible) {
      isActiveRef.current = true;
      setVoiceState("idle");
      setTranscript("");
      setDisplayText("");
      setErrorText("");
      setTurns([]);
      setShowHistory(false);
      speech.resetForNewResponse();
      speech.prevRespondingRef.current = false;
      retryCountRef.current = 0;
      lastResponseTextRef.current = "";
      anim.resetForOpen();
      Animated.timing(anim.fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      autoStartTimerRef.current = setTimeout(() => {
        if (isActiveRef.current) {
          console.log("[VoiceMode] Auto-starting listening");
          startListening();
        }
      }, AUTO_LISTEN_DELAY);
    } else {
      isActiveRef.current = false;
      if (autoStartTimerRef.current) { clearTimeout(autoStartTimerRef.current); autoStartTimerRef.current = null; }
      speech.stopSpeaking();
      cleanupTranscription();
      recording.cleanup();
      anim.stopAllAnims();
    }
  }, [visible, anim, speech, recording, cleanupTranscription, startListening]);

  useEffect(() => {
    if (!streamingText || isMutedRef.current) return;
    speech.processStreamingText(streamingText);
    setDisplayText(streamingText);
  }, [streamingText, speech]);

  useEffect(() => {
    if (isResponding && voiceStateRef.current !== "thinking" && voiceStateRef.current !== "speaking") {
      console.log("[VoiceMode] Agent responding, switching to thinking");
      setVoiceState("thinking");
      setDisplayText("");
      speech.resetForNewResponse();
      lastResponseTextRef.current = "";
    }
    if (isResponding && lastAssistantText) lastResponseTextRef.current = lastAssistantText;

    if (speech.prevRespondingRef.current && !isResponding) {
      const responseText = (lastResponseTextRef.current || lastAssistantText)?.trim();
      console.log("[VoiceMode] Agent done responding, text length:", responseText?.length ?? 0);
      if (responseText) {
        setDisplayText(responseText);
        addTurn("assistant", responseText);
      }
      speech.handleResponseComplete(responseText || "");
    }
    speech.prevRespondingRef.current = isResponding;
  }, [isResponding, lastAssistantText, addTurn, speech]);

  const { orbTint, stateLabel, BAR_HEIGHTS, SPEAK_HEIGHTS } = anim;

  const micBars = anim.barAnims.map((a, i) => {
    const baseHeight = BAR_HEIGHTS[i];
    const height = voiceState === "listening" ? baseHeight * (0.4 + micLevel * 0.6) : baseHeight;
    return (
      <Animated.View key={i} style={[styles.bar, { height, opacity: a, backgroundColor: orbTint }]} />
    );
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <Animated.View style={[styles.container, { opacity: anim.fadeAnim, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Animated.View style={[styles.bgGlow, { opacity: anim.bgPulse, backgroundColor: orbTint }]} />

        <View style={styles.topBar}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: orbTint }]} />
            <Text style={styles.statusText}>{stateLabel}</Text>
          </View>
          <View style={styles.topActions}>
            {turns.length > 0 && (
              <TouchableOpacity style={styles.iconBtn} onPress={toggleHistory} activeOpacity={0.7}>
                <ChevronDown size={18} color={Colors.dark.textSecondary} style={{ transform: [{ rotate: showHistory ? "180deg" : "0deg" }] }} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.iconBtn, isMuted && styles.iconBtnActive]} onPress={toggleMute} activeOpacity={0.7} testID="voice-mute">
              {isMuted ? <VolumeX size={17} color={Colors.dark.error} /> : <Volume2 size={17} color={Colors.dark.cyan} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7} testID="voice-close">
              <X size={20} color={Colors.dark.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {showHistory && turns.length > 0 && (
          <Animated.View style={[styles.historyContainer, { opacity: anim.historyOpacity }]}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={styles.historyScroll}>
              {turns.map((turn, i) => (
                <View key={i} style={[styles.turnBubble, turn.role === "user" ? styles.userTurn : styles.assistantTurn]}>
                  <Text style={[styles.turnLabel, { color: turn.role === "user" ? Colors.dark.accent : Colors.dark.cyan }]}>
                    {turn.role === "user" ? "You" : "AI"}
                  </Text>
                  <Text style={styles.turnText} numberOfLines={4}>{turn.text}</Text>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <View style={styles.orbArea}>
          <Animated.View style={[styles.haloRing, { transform: [{ scale: anim.haloScale }], opacity: anim.haloOpacity, borderColor: orbTint }]} />
          <Animated.View style={[styles.haloRing, { transform: [{ scale: anim.halo2Scale }], opacity: anim.halo2Opacity, borderColor: orbTint }]} />
          <Animated.View style={[styles.haloRing, { transform: [{ scale: anim.halo3Scale }], opacity: anim.halo3Opacity, borderColor: orbTint }]} />

          <TouchableOpacity activeOpacity={0.85} onPress={handleOrbPress} disabled={voiceState === "processing"}>
            <Animated.View style={[styles.orbShell, { transform: [{ scale: anim.orbScale }] }]}>
              <Animated.View style={[styles.orbGlowBg, { opacity: anim.innerGlow, backgroundColor: orbTint }]} />
              <Animated.View style={[styles.orbSurface, { borderColor: orbTint, opacity: anim.orbOpacity }]}>
                {voiceState === "listening" ? (
                  <View style={styles.barsRow}>{micBars}</View>
                ) : voiceState === "speaking" ? (
                  <View style={styles.barsRow}>
                    {anim.speakWave.map((w, i) => (
                      <Animated.View key={i} style={[styles.speakBar, { height: SPEAK_HEIGHTS[i], opacity: w, backgroundColor: orbTint }]} />
                    ))}
                  </View>
                ) : voiceState === "thinking" || voiceState === "processing" ? (
                  <View style={styles.dotsRow}>
                    {anim.dotAnims.map((d, i) => (
                      <Animated.View key={i} style={[styles.dot, { backgroundColor: orbTint, opacity: d }]} />
                    ))}
                  </View>
                ) : (
                  <Mic size={44} color={orbTint} />
                )}
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.textArea}>
          {errorText ? (
            <Text style={styles.errorText}>{errorText}</Text>
          ) : displayText ? (
            <Text style={styles.displayText} numberOfLines={5}>{displayText}</Text>
          ) : voiceState === "listening" ? (
            <Text style={styles.hintLabel}>Listening...</Text>
          ) : voiceState === "idle" ? (
            <Text style={styles.hintLabel}>Tap to speak</Text>
          ) : null}
          {transcript && (voiceState === "thinking" || voiceState === "speaking") && (
            <Text style={styles.transcriptLabel}>You said: {'"'}{transcript}{'"'}</Text>
          )}
        </View>

        <View style={styles.bottomBar}>
          {voiceState === "speaking" && <Text style={styles.bottomHint}>Tap orb to interrupt</Text>}
          {voiceState === "thinking" && <Text style={styles.bottomHint}>Thinking...</Text>}
          {voiceState === "idle" && <Text style={styles.bottomHint}>Conversation flows automatically</Text>}
          {voiceState === "listening" && (
            <TouchableOpacity
              style={styles.endBtn}
              onPress={() => {
                recording.cleanup();
                setVoiceState("idle");
                setTranscript("");
                setDisplayText("");
                setMicLevel(0);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.endBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050507", justifyContent: "space-between" },
  bgGlow: {
    position: "absolute", top: SCREEN_HEIGHT * 0.2, left: SCREEN_WIDTH * 0.1,
    width: SCREEN_WIDTH * 0.8, height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4, transform: [{ scaleY: 1.3 }],
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: "rgba(239,68,68,0.15)" },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  historyContainer: { maxHeight: 180, marginHorizontal: 16, marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 10 },
  historyScroll: { flex: 1 },
  turnBubble: { marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  userTurn: { backgroundColor: "rgba(16,185,129,0.08)", alignSelf: "flex-end" as const, maxWidth: "85%" as const },
  assistantTurn: { backgroundColor: "rgba(34,211,238,0.08)", alignSelf: "flex-start" as const, maxWidth: "85%" as const },
  turnLabel: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.5, marginBottom: 3, textTransform: "uppercase" as const },
  turnText: { color: "#D4D4D8", fontSize: 13, lineHeight: 18 },
  orbArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  haloRing: { position: "absolute", width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2, borderWidth: 1 },
  orbShell: { width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2, alignItems: "center", justifyContent: "center" },
  orbGlowBg: { position: "absolute", width: ORB_SIZE + 50, height: ORB_SIZE + 50, borderRadius: (ORB_SIZE + 50) / 2 },
  orbSurface: { width: ORB_SIZE - 6, height: ORB_SIZE - 6, borderRadius: (ORB_SIZE - 6) / 2, borderWidth: 1.5, backgroundColor: "#0A0A0C", alignItems: "center", justifyContent: "center" },
  barsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  bar: { width: 4, borderRadius: 2 },
  speakBar: { width: 5, borderRadius: 3 },
  dotsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  textArea: { paddingHorizontal: 28, alignItems: "center", minHeight: 100 },
  displayText: { color: "#E4E4E7", fontSize: 16, textAlign: "center" as const, lineHeight: 24, fontWeight: "400" as const },
  errorText: { color: "#EF4444", fontSize: 14, textAlign: "center" as const },
  hintLabel: { color: "#71717A", fontSize: 15, fontWeight: "500" as const },
  transcriptLabel: { color: "#52525B", fontSize: 12, textAlign: "center" as const, marginTop: 10, fontStyle: "italic" as const },
  bottomBar: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, minHeight: 44 },
  bottomHint: { color: "#3F3F46", fontSize: 12 },
  endBtn: { backgroundColor: "rgba(239,68,68,0.12)", paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20 },
  endBtnText: { color: "#EF4444", fontSize: 14, fontWeight: "600" as const },
});
