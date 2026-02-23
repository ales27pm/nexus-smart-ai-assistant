import React, { useState, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Send, Plus, Mic, X, MicOff, AudioLines } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import Colors from "@/constants/colors";

export interface ChatFile {
  type: "file";
  mimeType: string;
  uri: string;
}

interface ChatInputProps {
  onSend: (text: string, files?: ChatFile[]) => void;
  disabled?: boolean;
  onOpenVoiceMode?: () => void;
}

const STT_URL = "https://toolkit.rork.com/stt/transcribe/";

export default function ChatInput({
  onSend,
  disabled,
  onOpenVoiceMode,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachedImages, setAttachedImages] = useState<ChatFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
    const files = attachedImages.length > 0 ? [...attachedImages] : undefined;
    onSend(trimmed, files);
    setText("");
    setAttachedImages([]);
  }, [text, attachedImages, disabled, onSend, scaleAnim]);

  const handlePickImage = useCallback(async () => {
    try {
      const permResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow access to your photo library to attach images.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType ?? "image/jpeg";
        let uri: string;
        if (asset.base64) {
          uri = `data:${mimeType};base64,${asset.base64}`;
        } else {
          uri = asset.uri;
        }
        setAttachedImages((prev) => [...prev, { type: "file", mimeType, uri }]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        console.log("[ChatInput] Image attached:", mimeType);
      }
    } catch (e) {
      console.log("[ChatInput] Image picker error:", e);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const startPulse = useCallback(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoopRef.current = loop;
    loop.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const transcribeAudio = useCallback(async (formData: FormData) => {
    setIsTranscribing(true);
    try {
      const response = await fetch(STT_URL, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        console.log("[ChatInput] STT error:", response.status);
        Alert.alert("Error", "Speech recognition failed. Please try again.");
        return;
      }
      const data = await response.json();
      if (data.text) {
        setText((prev) => (prev ? prev + " " + data.text : data.text));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log("[ChatInput] Transcribed:", data.text.substring(0, 60));
      }
    } catch (e) {
      console.log("[ChatInput] Transcription error:", e);
      Alert.alert("Error", "Failed to transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startRecordingNative = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow microphone access for voice input.",
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {},
      });
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      startPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      console.log("[ChatInput] Recording started (native)");
    } catch (e) {
      console.log("[ChatInput] Recording start error:", e);
      Alert.alert("Error", "Failed to start recording.");
    }
  }, [startPulse]);

  const stopRecordingNative = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      stopPulse();
      console.log("[ChatInput] Recording stopped, uri:", uri);
      if (!uri) return;
      const uriParts = uri.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const formData = new FormData();
      const audioFile = {
        uri,
        name: `recording.${fileType}`,
        type: `audio/${fileType}`,
      };
      formData.append("audio", audioFile as any);
      await transcribeAudio(formData);
    } catch (e) {
      console.log("[ChatInput] Recording stop error:", e);
      setIsRecording(false);
      stopPulse();
    }
  }, [stopPulse, transcribeAudio]);

  const startRecordingWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      startPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      console.log("[ChatInput] Recording started (web)");
    } catch (e) {
      console.log("[ChatInput] Web recording error:", e);
      Alert.alert("Error", "Failed to access microphone.");
    }
  }, [startPulse]);

  const stopRecordingWeb = useCallback(async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) return;
      return new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          setIsRecording(false);
          stopPulse();
          const file = new File([blob], "recording.webm", {
            type: "audio/webm",
          });
          const formData = new FormData();
          formData.append("audio", file);
          await transcribeAudio(formData);
          resolve();
        };
        mediaRecorder.stop();
      });
    } catch (e) {
      console.log("[ChatInput] Web stop error:", e);
      setIsRecording(false);
      stopPulse();
    }
  }, [stopPulse, transcribeAudio]);

  const toggleRecording = useCallback(async () => {
    if (disabled || isTranscribing) return;
    if (isRecording) {
      if (Platform.OS === "web") {
        await stopRecordingWeb();
      } else {
        await stopRecordingNative();
      }
    } else {
      if (Platform.OS === "web") {
        await startRecordingWeb();
      } else {
        await startRecordingNative();
      }
    }
  }, [
    isRecording,
    disabled,
    isTranscribing,
    startRecordingNative,
    stopRecordingNative,
    startRecordingWeb,
    stopRecordingWeb,
  ]);

  const handleOpenVoiceMode = useCallback(() => {
    if (onOpenVoiceMode && !disabled && !isTranscribing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onOpenVoiceMode();
    }
  }, [onOpenVoiceMode, disabled, isTranscribing]);

  const hasContent = text.trim().length > 0 || attachedImages.length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.container}>
        {attachedImages.length > 0 && (
          <View style={styles.previewRow}>
            {attachedImages.map((img, idx) => (
              <View key={idx} style={styles.previewItem}>
                <Image source={{ uri: img.uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeImage(idx)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={10} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.6}
            onPress={handlePickImage}
            disabled={disabled}
            testID="attach-button"
          >
            <Plus
              size={18}
              color={
                disabled ? Colors.dark.textTertiary : Colors.dark.textSecondary
              }
            />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={
              isRecording
                ? "Listening..."
                : isTranscribing
                  ? "Transcribing..."
                  : "Ask anything..."
            }
            placeholderTextColor={
              isRecording ? Colors.dark.error : Colors.dark.textTertiary
            }
            multiline
            maxLength={4000}
            editable={!disabled && !isRecording}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            testID="chat-input"
          />
          {hasContent ? (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={disabled}
                activeOpacity={0.7}
                testID="send-button"
              >
                <Send
                  size={16}
                  color={disabled ? Colors.dark.textTertiary : "#fff"}
                />
              </TouchableOpacity>
            </Animated.View>
          ) : isTranscribing ? (
            <View style={styles.actionBtn}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            </View>
          ) : (
            <View style={styles.micRow}>
              <TouchableOpacity
                style={styles.voiceModeBtn}
                activeOpacity={0.6}
                onPress={handleOpenVoiceMode}
                disabled={disabled}
                testID="voice-mode-button"
              >
                <AudioLines
                  size={16}
                  color={disabled ? Colors.dark.textTertiary : Colors.dark.cyan}
                />
              </TouchableOpacity>
              <Animated.View
                style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}
              >
                <TouchableOpacity
                  style={[styles.actionBtn, isRecording && styles.recordingBtn]}
                  activeOpacity={0.6}
                  onPress={toggleRecording}
                  disabled={disabled}
                  testID="mic-button"
                >
                  {isRecording ? (
                    <MicOff size={18} color={Colors.dark.error} />
                  ) : (
                    <Mic size={18} color={Colors.dark.textSecondary} />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.background,
  },
  previewRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  previewItem: {
    position: "relative",
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  removeBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  voiceModeBtn: {
    width: 32,
    height: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBtn: {
    backgroundColor: Colors.dark.errorDim,
  },
  input: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 4,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: Colors.dark.surfaceHover,
  },
});
