import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { X, Mic, MicOff, Waves } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STT_URL = 'https://toolkit.rork.com/stt/transcribe/';

type VoiceState = 'idle' | 'listening' | 'processing' | 'responding' | 'paused';

interface VoiceModeProps {
  visible: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  isResponding: boolean;
  lastAssistantText: string;
}

const SILENCE_THRESHOLD = -35;
const SILENCE_DURATION_MS = 1800;
const MIN_RECORDING_MS = 600;
const ORB_SIZE = 180;

export default function VoiceMode({
  visible,
  onClose,
  onSend,
  isResponding,
  lastAssistantText,
}: VoiceModeProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [displayText, setDisplayText] = useState('Tap the orb to start');
  const [errorText, setErrorText] = useState('');

  const orbScale = useRef(new Animated.Value(1)).current;
  const orbGlow = useRef(new Animated.Value(0.3)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.3)).current;
  const waveAnim2 = useRef(new Animated.Value(0.5)).current;
  const waveAnim3 = useRef(new Animated.Value(0.2)).current;
  const processingRotation = useRef(new Animated.Value(0)).current;

  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartTime = useRef<number>(0);
  const isActiveRef = useRef(false);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const prevRespondingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      isActiveRef.current = true;
      setVoiceState('idle');
      setTranscript('');
      setDisplayText('Tap the orb to start');
      setErrorText('');
      orbScale.setValue(1);
      orbGlow.setValue(0.3);
    } else {
      isActiveRef.current = false;
      cleanupAll();
    }
  }, [visible]);

  useEffect(() => {
    if (isResponding && voiceState !== 'responding') {
      setVoiceState('responding');
      setDisplayText('Thinking...');
    }
    if (prevRespondingRef.current && !isResponding && voiceState === 'responding') {
      setDisplayText(lastAssistantText || 'Done');
      setTimeout(() => {
        if (isActiveRef.current) {
          startListening();
        }
      }, 1500);
    }
    prevRespondingRef.current = isResponding;
  }, [isResponding]);

  useEffect(() => {
    switch (voiceState) {
      case 'idle':
        animateIdle();
        break;
      case 'listening':
        animateListening();
        break;
      case 'processing':
        animateProcessing();
        break;
      case 'responding':
        animateResponding();
        break;
      case 'paused':
        animateIdle();
        break;
    }
    return () => {
      if (animLoopRef.current) {
        animLoopRef.current.stop();
        animLoopRef.current = null;
      }
    };
  }, [voiceState]);

  const animateIdle = useCallback(() => {
    if (animLoopRef.current) {
      animLoopRef.current.stop();
    }
    Animated.timing(orbGlow, { toValue: 0.3, duration: 400, useNativeDriver: true }).start();
    ring1Opacity.setValue(0);
    ring2Opacity.setValue(0);
    ring3Opacity.setValue(0);

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 0.95, duration: 2000, useNativeDriver: true }),
      ])
    );
    animLoopRef.current = breathe;
    breathe.start();
  }, [orbScale, orbGlow, ring1Opacity, ring2Opacity, ring3Opacity]);

  const animateListening = useCallback(() => {
    if (animLoopRef.current) {
      animLoopRef.current.stop();
    }
    Animated.timing(orbGlow, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();

    const pulseRings = Animated.loop(
      Animated.stagger(300, [
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring1Scale, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
            Animated.timing(ring1Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring1Opacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
            Animated.timing(ring1Opacity, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring2Scale, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
            Animated.timing(ring2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring2Opacity, { toValue: 0.4, duration: 100, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring3Scale, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
            Animated.timing(ring3Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring3Opacity, { toValue: 0.3, duration: 100, useNativeDriver: true }),
            Animated.timing(ring3Opacity, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    animLoopRef.current = pulseRings;
    pulseRings.start();

    const wavesLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(waveAnim1, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(waveAnim1, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(150),
          Animated.timing(waveAnim2, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(waveAnim2, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(waveAnim3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(waveAnim3, { toValue: 0.2, duration: 300, useNativeDriver: true }),
        ]),
      ])
    );
    wavesLoop.start();
  }, [orbGlow, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, ring3Scale, ring3Opacity, waveAnim1, waveAnim2, waveAnim3]);

  const animateProcessing = useCallback(() => {
    if (animLoopRef.current) {
      animLoopRef.current.stop();
    }
    ring1Opacity.setValue(0);
    ring2Opacity.setValue(0);
    ring3Opacity.setValue(0);

    Animated.timing(orbGlow, { toValue: 0.6, duration: 200, useNativeDriver: true }).start();

    const spin = Animated.loop(
      Animated.timing(processingRotation, { toValue: 1, duration: 2000, useNativeDriver: true })
    );
    animLoopRef.current = spin;
    spin.start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.08, duration: 500, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 0.92, duration: 500, useNativeDriver: true }),
      ])
    );
    pulse.start();
  }, [orbGlow, orbScale, processingRotation, ring1Opacity, ring2Opacity, ring3Opacity]);

  const animateResponding = useCallback(() => {
    if (animLoopRef.current) {
      animLoopRef.current.stop();
    }
    ring1Opacity.setValue(0);
    ring2Opacity.setValue(0);
    ring3Opacity.setValue(0);

    Animated.timing(orbGlow, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const respondPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 0.88, duration: 700, useNativeDriver: true }),
      ])
    );
    animLoopRef.current = respondPulse;
    respondPulse.start();
  }, [orbGlow, orbScale, ring1Opacity, ring2Opacity, ring3Opacity]);

  const cleanupAll = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
    if (animLoopRef.current) {
      animLoopRef.current.stop();
      animLoopRef.current = null;
    }
    if (recordingRef.current) {
      try {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      } catch (_e) {}
      recordingRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_e) {}
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const transcribeAudio = useCallback(async (formData: FormData): Promise<string | null> => {
    try {
      console.log('[VoiceMode] Transcribing audio...');
      const response = await fetch(STT_URL, { method: 'POST', body: formData });
      if (!response.ok) {
        console.log('[VoiceMode] STT error:', response.status);
        return null;
      }
      const data = await response.json();
      console.log('[VoiceMode] Transcribed:', data.text?.substring(0, 80));
      return data.text || null;
    } catch (e) {
      console.log('[VoiceMode] Transcription error:', e);
      return null;
    }
  }, []);

  const handleTranscriptReady = useCallback((text: string) => {
    if (!text.trim()) {
      console.log('[VoiceMode] Empty transcript, restarting listening');
      if (isActiveRef.current) {
        startListening();
      }
      return;
    }
    setTranscript(text);
    setDisplayText(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(text);
  }, [onSend]);

  const stopAndTranscribeNative = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;

      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }

      setVoiceState('processing');
      setDisplayText('Processing...');

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        console.log('[VoiceMode] No URI from recording');
        if (isActiveRef.current) startListening();
        return;
      }

      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      const formData = new FormData();
      formData.append('audio', {
        uri,
        name: `recording.${fileType}`,
        type: `audio/${fileType}`,
      } as any);

      const text = await transcribeAudio(formData);
      if (text) {
        handleTranscriptReady(text);
      } else {
        setErrorText('Could not understand. Try again.');
        setTimeout(() => {
          setErrorText('');
          if (isActiveRef.current) startListening();
        }, 1500);
      }
    } catch (e) {
      console.log('[VoiceMode] Stop native error:', e);
      setVoiceState('idle');
    }
  }, [transcribeAudio, handleTranscriptReady]);

  const stopAndTranscribeWeb = useCallback(async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

      setVoiceState('processing');
      setDisplayText('Processing...');

      return new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;

          const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', file);

          const text = await transcribeAudio(formData);
          if (text) {
            handleTranscriptReady(text);
          } else {
            setErrorText('Could not understand. Try again.');
            setTimeout(() => {
              setErrorText('');
              if (isActiveRef.current) startListening();
            }, 1500);
          }
          resolve();
        };
        mediaRecorder.stop();
      });
    } catch (e) {
      console.log('[VoiceMode] Stop web error:', e);
      setVoiceState('idle');
    }
  }, [transcribeAudio, handleTranscriptReady]);

  const startListeningNative = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setErrorText('Microphone permission required');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      });

      await recording.startAsync();
      recordingRef.current = recording;
      recordingStartTime.current = Date.now();
      setVoiceState('listening');
      setDisplayText('Listening...');
      setErrorText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let consecutiveSilentFrames = 0;
      const SILENCE_FRAMES_NEEDED = Math.ceil(SILENCE_DURATION_MS / 250);

      meteringIntervalRef.current = setInterval(async () => {
        try {
          if (!recordingRef.current) return;
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording) return;

          const metering = status.metering ?? -160;
          const elapsed = Date.now() - recordingStartTime.current;

          if (metering < SILENCE_THRESHOLD && elapsed > MIN_RECORDING_MS) {
            consecutiveSilentFrames++;
            if (consecutiveSilentFrames >= SILENCE_FRAMES_NEEDED) {
              console.log('[VoiceMode] Silence detected, stopping');
              if (meteringIntervalRef.current) {
                clearInterval(meteringIntervalRef.current);
                meteringIntervalRef.current = null;
              }
              stopAndTranscribeNative();
            }
          } else {
            consecutiveSilentFrames = 0;
          }
        } catch (_e) {}
      }, 250);

      console.log('[VoiceMode] Native recording started');
    } catch (e) {
      console.log('[VoiceMode] Native start error:', e);
      setErrorText('Failed to start recording');
      setVoiceState('idle');
    }
  }, [stopAndTranscribeNative]);

  const startListeningWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTime.current = Date.now();
      setVoiceState('listening');
      setDisplayText('Listening...');
      setErrorText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let consecutiveSilentFrames = 0;
      const SILENCE_FRAMES_NEEDED = Math.ceil(SILENCE_DURATION_MS / 250);

      meteringIntervalRef.current = setInterval(() => {
        try {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const elapsed = Date.now() - recordingStartTime.current;

          if (avg < 15 && elapsed > MIN_RECORDING_MS) {
            consecutiveSilentFrames++;
            if (consecutiveSilentFrames >= SILENCE_FRAMES_NEEDED) {
              console.log('[VoiceMode] Web silence detected');
              if (meteringIntervalRef.current) {
                clearInterval(meteringIntervalRef.current);
                meteringIntervalRef.current = null;
              }
              audioContext.close();
              stopAndTranscribeWeb();
            }
          } else {
            consecutiveSilentFrames = 0;
          }
        } catch (_e) {}
      }, 250);

      console.log('[VoiceMode] Web recording started');
    } catch (e) {
      console.log('[VoiceMode] Web start error:', e);
      setErrorText('Microphone access required');
      setVoiceState('idle');
    }
  }, [stopAndTranscribeWeb]);

  const startListening = useCallback(() => {
    if (!isActiveRef.current) return;
    if (Platform.OS === 'web') {
      startListeningWeb();
    } else {
      startListeningNative();
    }
  }, [startListeningNative, startListeningWeb]);

  const handleOrbPress = useCallback(() => {
    if (voiceState === 'idle' || voiceState === 'paused') {
      startListening();
    } else if (voiceState === 'listening') {
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
      if (Platform.OS === 'web') {
        stopAndTranscribeWeb();
      } else {
        stopAndTranscribeNative();
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [voiceState, startListening, stopAndTranscribeNative, stopAndTranscribeWeb]);

  const handleClose = useCallback(() => {
    cleanupAll();
    onClose();
  }, [cleanupAll, onClose]);

  const spinDeg = processingRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const orbColor = voiceState === 'listening'
    ? Colors.dark.accent
    : voiceState === 'processing'
    ? Colors.dark.info
    : voiceState === 'responding'
    ? Colors.dark.cyan
    : Colors.dark.textTertiary;

  const stateLabel = voiceState === 'idle'
    ? 'TAP TO SPEAK'
    : voiceState === 'listening'
    ? 'LISTENING'
    : voiceState === 'processing'
    ? 'PROCESSING'
    : voiceState === 'responding'
    ? 'RESPONDING'
    : 'PAUSED';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.stateChip}>
            <View style={[styles.stateDot, { backgroundColor: orbColor }]} />
            <Text style={styles.stateLabel}>{stateLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.7}
            testID="voice-close"
          >
            <X size={22} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.orbArea}>
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ring1Scale }],
                opacity: ring1Opacity,
                borderColor: orbColor,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ring2Scale }],
                opacity: ring2Opacity,
                borderColor: orbColor,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ring3Scale }],
                opacity: ring3Opacity,
                borderColor: orbColor,
              },
            ]}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOrbPress}
            disabled={voiceState === 'processing' || voiceState === 'responding'}
          >
            <Animated.View
              style={[
                styles.orbOuter,
                {
                  transform: [
                    { scale: orbScale },
                    ...(voiceState === 'processing' ? [{ rotate: spinDeg }] : []),
                  ],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.orbGlow,
                  {
                    opacity: orbGlow,
                    backgroundColor: orbColor,
                  },
                ]}
              />
              <View style={[styles.orbInner, { borderColor: orbColor }]}>
                {voiceState === 'listening' ? (
                  <View style={styles.waveContainer}>
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim1, backgroundColor: orbColor, height: 32 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim2, backgroundColor: orbColor, height: 48 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim1, backgroundColor: orbColor, height: 40 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim3, backgroundColor: orbColor, height: 56 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim2, backgroundColor: orbColor, height: 36 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim1, backgroundColor: orbColor, height: 44 }]} />
                    <Animated.View style={[styles.waveBar, { opacity: waveAnim3, backgroundColor: orbColor, height: 28 }]} />
                  </View>
                ) : voiceState === 'processing' ? (
                  <Waves size={48} color={orbColor} />
                ) : voiceState === 'responding' ? (
                  <View style={styles.respondDots}>
                    <Animated.View style={[styles.respondDot, { backgroundColor: orbColor, opacity: waveAnim1 }]} />
                    <Animated.View style={[styles.respondDot, { backgroundColor: orbColor, opacity: waveAnim2 }]} />
                    <Animated.View style={[styles.respondDot, { backgroundColor: orbColor, opacity: waveAnim3 }]} />
                  </View>
                ) : (
                  <Mic size={52} color={orbColor} />
                )}
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.textArea}>
          {errorText ? (
            <Animated.Text style={[styles.errorText, { opacity: textOpacity }]}>
              {errorText}
            </Animated.Text>
          ) : (
            <Animated.Text
              style={[styles.displayText, { opacity: textOpacity }]}
              numberOfLines={6}
            >
              {displayText}
            </Animated.Text>
          )}
          {transcript && voiceState === 'responding' && (
            <Text style={styles.transcriptLabel}>You said: "{transcript}"</Text>
          )}
        </View>

        <View style={styles.bottomBar}>
          {voiceState === 'listening' && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                cleanupAll();
                setVoiceState('idle');
                setDisplayText('Tap the orb to start');
                setTranscript('');
              }}
              activeOpacity={0.7}
            >
              <MicOff size={18} color={Colors.dark.error} />
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
          {voiceState === 'idle' && (
            <Text style={styles.hintText}>
              Automatic turn-taking enabled
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 1.5,
  },
  orbOuter: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlow: {
    position: 'absolute',
    width: ORB_SIZE + 40,
    height: ORB_SIZE + 40,
    borderRadius: (ORB_SIZE + 40) / 2,
  },
  orbInner: {
    width: ORB_SIZE - 4,
    height: ORB_SIZE - 4,
    borderRadius: (ORB_SIZE - 4) / 2,
    borderWidth: 2,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  waveBar: {
    width: 5,
    borderRadius: 3,
  },
  respondDots: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  respondDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  textArea: {
    paddingHorizontal: 32,
    alignItems: 'center',
    minHeight: 120,
  },
  displayText: {
    color: Colors.dark.text,
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500' as const,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 15,
    textAlign: 'center',
  },
  transcriptLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic' as const,
  },
  bottomBar: {
    alignItems: 'center',
    paddingHorizontal: 20,
    minHeight: 50,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.errorDim,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  cancelText: {
    color: Colors.dark.error,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  hintText: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
  },
});
