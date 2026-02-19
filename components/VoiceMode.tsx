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
  ScrollView,
  Easing,
} from 'react-native';
import { X, Mic, Volume2, VolumeX, ChevronDown } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STT_URL = 'https://toolkit.rork.com/stt/transcribe/';

type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking';

interface VoiceTurn {
  role: 'user' | 'assistant';
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

const SILENCE_THRESHOLD = -35;
const SILENCE_DURATION_MS = 1800;
const MIN_RECORDING_MS = 700;
const ORB_SIZE = 160;
const SPEECH_CHUNK_SIZE = 120;

export default function VoiceMode({
  visible,
  onClose,
  onSend,
  isResponding,
  lastAssistantText,
  streamingText,
}: VoiceModeProps) {
  const insets = useSafeAreaInsets();
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const orbScale = useRef(new Animated.Value(1)).current;
  const orbOpacity = useRef(new Animated.Value(0.6)).current;
  const haloScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const halo2Scale = useRef(new Animated.Value(1)).current;
  const halo2Opacity = useRef(new Animated.Value(0)).current;
  const halo3Scale = useRef(new Animated.Value(1)).current;
  const halo3Opacity = useRef(new Animated.Value(0)).current;
  const innerGlow = useRef(new Animated.Value(0.4)).current;
  const barAnims = useRef(Array.from({ length: 9 }, () => new Animated.Value(0.15))).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bgPulse = useRef(new Animated.Value(0)).current;
  const dotAnims = useRef(Array.from({ length: 3 }, () => new Animated.Value(0.3))).current;
  const speakWave = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.2))).current;
  const historyOpacity = useRef(new Animated.Value(0)).current;

  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTime = useRef<number>(0);
  const isActiveRef = useRef(false);
  const animLoopsRef = useRef<Animated.CompositeAnimation[]>([]);
  const prevRespondingRef = useRef(false);
  const lastSpokenTextRef = useRef('');
  const isSpeakingRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef(false);
  const spokenLengthRef = useRef(0);
  const speakQueueRef = useRef<string[]>([]);
  const isSpeakingChunkRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    if (visible) {
      isActiveRef.current = true;
      setVoiceState('idle');
      setTranscript('');
      setDisplayText('');
      setErrorText('');
      setTurns([]);
      setShowHistory(false);
      lastSpokenTextRef.current = '';
      spokenLengthRef.current = 0;
      speakQueueRef.current = [];
      isSpeakingChunkRef.current = false;
      orbScale.setValue(1);
      orbOpacity.setValue(0.6);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      autoStartTimerRef.current = setTimeout(() => {
        if (isActiveRef.current) {
          console.log('[VoiceMode] Auto-starting listening');
          startListening();
        }
      }, 600);
    } else {
      isActiveRef.current = false;
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      stopSpeaking();
      cleanupAll();
    }
  }, [visible]);

  useEffect(() => {
    if (streamingText && voiceState === 'thinking' && !isMutedRef.current) {
      const newContent = streamingText.substring(spokenLengthRef.current);
      if (newContent.length >= SPEECH_CHUNK_SIZE) {
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
      }
      setDisplayText(streamingText);
    }
  }, [streamingText, voiceState]);

  useEffect(() => {
    if (isResponding && voiceState !== 'thinking' && voiceState !== 'speaking') {
      setVoiceState('thinking');
      setDisplayText('');
      spokenLengthRef.current = 0;
      speakQueueRef.current = [];
    }

    if (prevRespondingRef.current && !isResponding) {
      const responseText = lastAssistantText?.trim();
      if (responseText) {
        const remaining = responseText.substring(spokenLengthRef.current);
        if (remaining.trim()) {
          enqueueSpeechChunk(remaining);
        }
        setDisplayText(responseText);
        addTurn('assistant', responseText);
        if (isMutedRef.current && !isSpeakingChunkRef.current) {
          finishSpeakingCycle();
        }
      } else {
        finishSpeakingCycle();
      }
    }
    prevRespondingRef.current = isResponding;
  }, [isResponding, lastAssistantText]);

  useEffect(() => {
    stopAllAnims();
    switch (voiceState) {
      case 'idle': animateIdle(); break;
      case 'listening': animateListening(); break;
      case 'processing': animateProcessing(); break;
      case 'thinking': animateThinking(); break;
      case 'speaking': animateSpeaking(); break;
    }
    return () => stopAllAnims();
  }, [voiceState]);

  const stopAllAnims = useCallback(() => {
    animLoopsRef.current.forEach(a => a.stop());
    animLoopsRef.current = [];
  }, []);

  const startLoop = useCallback((anim: Animated.CompositeAnimation) => {
    animLoopsRef.current.push(anim);
    anim.start();
  }, []);

  const animateIdle = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 0.5, duration: 400, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.3, duration: 400, useNativeDriver: true }).start();
    haloOpacity.setValue(0);
    halo2Opacity.setValue(0);
    halo3Opacity.setValue(0);
    Animated.timing(bgPulse, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    barAnims.forEach(b => b.setValue(0.15));

    startLoop(Animated.loop(Animated.sequence([
      Animated.timing(orbScale, { toValue: 1.04, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(orbScale, { toValue: 0.96, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));
  }, []);

  const animateListening = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.8, duration: 250, useNativeDriver: true }).start();
    Animated.timing(bgPulse, { toValue: 0.3, duration: 400, useNativeDriver: true }).start();

    startLoop(Animated.loop(Animated.stagger(180, [
      Animated.parallel([
        Animated.sequence([
          Animated.timing(haloScale, { toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(haloScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 0.35, duration: 80, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0, duration: 1320, useNativeDriver: true }),
        ]),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(halo2Scale, { toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(halo2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(halo2Opacity, { toValue: 0.25, duration: 80, useNativeDriver: true }),
          Animated.timing(halo2Opacity, { toValue: 0, duration: 1320, useNativeDriver: true }),
        ]),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(halo3Scale, { toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(halo3Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(halo3Opacity, { toValue: 0.15, duration: 80, useNativeDriver: true }),
          Animated.timing(halo3Opacity, { toValue: 0, duration: 1320, useNativeDriver: true }),
        ]),
      ]),
    ])));

    barAnims.forEach((b, i) => {
      startLoop(Animated.loop(Animated.sequence([
        Animated.delay(i * 60),
        Animated.timing(b, { toValue: 0.9 + Math.random() * 0.1, duration: 200 + Math.random() * 200, useNativeDriver: true }),
        Animated.timing(b, { toValue: 0.15 + Math.random() * 0.2, duration: 200 + Math.random() * 200, useNativeDriver: true }),
      ])));
    });
  }, []);

  const animateProcessing = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 0.7, duration: 200, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.6, duration: 200, useNativeDriver: true }).start();
    haloOpacity.setValue(0);
    halo2Opacity.setValue(0);
    halo3Opacity.setValue(0);
    Animated.timing(bgPulse, { toValue: 0.15, duration: 300, useNativeDriver: true }).start();

    startLoop(Animated.loop(Animated.sequence([
      Animated.timing(orbScale, { toValue: 1.06, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(orbScale, { toValue: 0.94, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));

    dotAnims.forEach((d, i) => {
      startLoop(Animated.loop(Animated.sequence([
        Animated.delay(i * 250),
        Animated.timing(d, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0.2, duration: 400, useNativeDriver: true }),
      ])));
    });
  }, []);

  const animateThinking = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.7, duration: 300, useNativeDriver: true }).start();
    haloOpacity.setValue(0);
    halo2Opacity.setValue(0);
    halo3Opacity.setValue(0);
    Animated.timing(bgPulse, { toValue: 0.2, duration: 400, useNativeDriver: true }).start();

    startLoop(Animated.loop(Animated.sequence([
      Animated.timing(orbScale, { toValue: 1.05, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(orbScale, { toValue: 0.95, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));

    dotAnims.forEach((d, i) => {
      startLoop(Animated.loop(Animated.sequence([
        Animated.delay(i * 300),
        Animated.timing(d, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0.15, duration: 500, useNativeDriver: true }),
      ])));
    });
  }, []);

  const animateSpeaking = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.9, duration: 200, useNativeDriver: true }).start();
    Animated.timing(bgPulse, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();

    startLoop(Animated.loop(Animated.sequence([
      Animated.timing(orbScale, { toValue: 1.08, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(orbScale, { toValue: 0.92, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));

    startLoop(Animated.loop(Animated.stagger(150, [
      Animated.parallel([
        Animated.sequence([
          Animated.timing(haloScale, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
          Animated.timing(haloScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 0.3, duration: 80, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0, duration: 920, useNativeDriver: true }),
        ]),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(halo2Scale, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
          Animated.timing(halo2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(halo2Opacity, { toValue: 0.2, duration: 80, useNativeDriver: true }),
          Animated.timing(halo2Opacity, { toValue: 0, duration: 920, useNativeDriver: true }),
        ]),
      ]),
    ])));

    speakWave.forEach((w, i) => {
      startLoop(Animated.loop(Animated.sequence([
        Animated.delay(i * 80),
        Animated.timing(w, { toValue: 0.8 + Math.random() * 0.2, duration: 250 + i * 30, useNativeDriver: true }),
        Animated.timing(w, { toValue: 0.15 + Math.random() * 0.15, duration: 250 + i * 30, useNativeDriver: true }),
      ])));
    });
  }, []);

  const cleanupAll = useCallback(() => {
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
    if (webLevelIntervalRef.current) {
      clearInterval(webLevelIntervalRef.current);
      webLevelIntervalRef.current = null;
    }
    stopAllAnims();
    if (recordingRef.current) {
      try { recordingRef.current.stopAndUnloadAsync().catch(() => {}); } catch (_e) {}
      recordingRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (_e) {}
      mediaRecorderRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_e) {}
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setMicLevel(0);
  }, [stopAllAnims]);

  const stopSpeaking = useCallback(() => {
    try {
      Speech.stop();
      isSpeakingRef.current = false;
      isSpeakingChunkRef.current = false;
      speakQueueRef.current = [];
    } catch (e) {
      console.log('[VoiceMode] Stop speech error:', e);
    }
  }, []);

  const addTurn = useCallback((role: 'user' | 'assistant', text: string) => {
    setTurns(prev => [...prev, { role, text, timestamp: Date.now() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const cleanTextForSpeech = useCallback((text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/`[^`]+`/g, (m) => m.replace(/`/g, ''))
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s/gm, '')
      .replace(/^\s*\d+\.\s/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);

  const processNextChunk = useCallback(() => {
    if (!isActiveRef.current) return;
    if (speakQueueRef.current.length === 0) {
      isSpeakingChunkRef.current = false;
      if (!prevRespondingRef.current) {
        finishSpeakingCycle();
      }
      return;
    }
    const chunk = speakQueueRef.current.shift()!;
    const cleaned = cleanTextForSpeech(chunk);
    if (!cleaned) {
      processNextChunk();
      return;
    }

    isSpeakingChunkRef.current = true;
    if (voiceStateRef.current !== 'speaking') {
      setVoiceState('speaking');
    }

    console.log('[VoiceMode] Speaking chunk:', cleaned.substring(0, 60));
    Speech.speak(cleaned, {
      language: 'en-US',
      pitch: 1.0,
      rate: Platform.OS === 'web' ? 1.0 : 0.95,
      onDone: () => {
        console.log('[VoiceMode] Chunk done, queue:', speakQueueRef.current.length);
        if (isActiveRef.current) processNextChunk();
      },
      onError: (err) => {
        console.log('[VoiceMode] Chunk speech error:', err);
        isSpeakingChunkRef.current = false;
        if (isActiveRef.current) processNextChunk();
      },
      onStopped: () => {
        isSpeakingChunkRef.current = false;
      },
    });
  }, [cleanTextForSpeech]);

  const enqueueSpeechChunk = useCallback((chunk: string) => {
    if (isMutedRef.current) return;
    speakQueueRef.current.push(chunk);
    if (!isSpeakingChunkRef.current) {
      processNextChunk();
    }
  }, [processNextChunk]);

  const finishSpeakingCycle = useCallback(() => {
    console.log('[VoiceMode] Finishing speaking cycle');
    isSpeakingRef.current = false;
    isSpeakingChunkRef.current = false;
    spokenLengthRef.current = 0;
    speakQueueRef.current = [];
    if (isActiveRef.current) {
      setVoiceState('idle');
      setDisplayText('');
      setTimeout(() => {
        if (isActiveRef.current) startListening();
      }, 500);
    }
  }, []);

  const transcribeAudio = useCallback(async (formData: FormData): Promise<string | null> => {
    try {
      console.log('[VoiceMode] Transcribing...');
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
      console.log('[VoiceMode] Empty transcript, restarting');
      if (isActiveRef.current) startListening();
      return;
    }
    setTranscript(text);
    setDisplayText(text);
    addTurn('user', text);
    setVoiceState('thinking');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(text);
  }, [onSend, addTurn]);

  const stopAndTranscribeNative = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
      setVoiceState('processing');
      setDisplayText('');
      setMicLevel(0);

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        if (isActiveRef.current) startListening();
        return;
      }
      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      const formData = new FormData();
      formData.append('audio', { uri, name: `recording.${fileType}`, type: `audio/${fileType}` } as any);

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
      console.log('[VoiceMode] Native stop error:', e);
      setVoiceState('idle');
    }
  }, [transcribeAudio, handleTranscriptReady]);

  const stopAndTranscribeWeb = useCallback(async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
      setVoiceState('processing');
      setDisplayText('');
      setMicLevel(0);
      if (webLevelIntervalRef.current) {
        clearInterval(webLevelIntervalRef.current);
        webLevelIntervalRef.current = null;
      }

      return new Promise<void>((resolve) => {
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          if (audioContextRef.current) {
            try { audioContextRef.current.close(); } catch (_e) {}
            audioContextRef.current = null;
            analyserRef.current = null;
          }
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
      console.log('[VoiceMode] Web stop error:', e);
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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
        },
        ios: {
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
          linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false,
        },
        web: {},
      });
      await recording.startAsync();
      recordingRef.current = recording;
      recordingStartTime.current = Date.now();
      setVoiceState('listening');
      setDisplayText('');
      setErrorText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let consecutiveSilentFrames = 0;
      const SILENCE_FRAMES_NEEDED = Math.ceil(SILENCE_DURATION_MS / 200);

      meteringIntervalRef.current = setInterval(async () => {
        try {
          if (!recordingRef.current) return;
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording) return;
          const metering = status.metering ?? -160;
          const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
          setMicLevel(normalized);
          const elapsed = Date.now() - recordingStartTime.current;
          if (metering < SILENCE_THRESHOLD && elapsed > MIN_RECORDING_MS) {
            consecutiveSilentFrames++;
            if (consecutiveSilentFrames >= SILENCE_FRAMES_NEEDED) {
              console.log('[VoiceMode] Silence detected');
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
      }, 200);
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
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTime.current = Date.now();
      setVoiceState('listening');
      setDisplayText('');
      setErrorText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let consecutiveSilentFrames = 0;
      const SILENCE_FRAMES_NEEDED = Math.ceil(SILENCE_DURATION_MS / 200);

      webLevelIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(1, avg / 128);
        setMicLevel(normalized);
      }, 50);

      meteringIntervalRef.current = setInterval(() => {
        try {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const elapsed = Date.now() - recordingStartTime.current;
          if (avg < 12 && elapsed > MIN_RECORDING_MS) {
            consecutiveSilentFrames++;
            if (consecutiveSilentFrames >= SILENCE_FRAMES_NEEDED) {
              console.log('[VoiceMode] Web silence detected');
              if (meteringIntervalRef.current) {
                clearInterval(meteringIntervalRef.current);
                meteringIntervalRef.current = null;
              }
              stopAndTranscribeWeb();
            }
          } else {
            consecutiveSilentFrames = 0;
          }
        } catch (_e) {}
      }, 200);
      console.log('[VoiceMode] Web recording started');
    } catch (e) {
      console.log('[VoiceMode] Web start error:', e);
      setErrorText('Microphone access required');
      setVoiceState('idle');
    }
  }, [stopAndTranscribeWeb]);

  const startListening = useCallback(() => {
    if (!isActiveRef.current) return;
    if (isSpeakingRef.current || isSpeakingChunkRef.current) stopSpeaking();
    if (Platform.OS === 'web') startListeningWeb();
    else startListeningNative();
  }, [startListeningNative, startListeningWeb, stopSpeaking]);

  const handleOrbPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (voiceState === 'speaking') {
      stopSpeaking();
      setVoiceState('idle');
      setDisplayText('');
      setTimeout(() => { if (isActiveRef.current) startListening(); }, 300);
      return;
    }
    if (voiceState === 'idle') {
      startListening();
    } else if (voiceState === 'listening') {
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
      if (Platform.OS === 'web') stopAndTranscribeWeb();
      else stopAndTranscribeNative();
    }
  }, [voiceState, startListening, stopAndTranscribeNative, stopAndTranscribeWeb, stopSpeaking]);

  const handleClose = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start(() => {
      stopSpeaking();
      cleanupAll();
      onClose();
    });
  }, [cleanupAll, stopSpeaking, onClose, fadeAnim]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (newMuted && (isSpeakingRef.current || isSpeakingChunkRef.current)) {
      stopSpeaking();
      setVoiceState('idle');
      setDisplayText('');
      setTimeout(() => { if (isActiveRef.current) startListening(); }, 400);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted, stopSpeaking, startListening]);

  const toggleHistory = useCallback(() => {
    const next = !showHistory;
    setShowHistory(next);
    Animated.timing(historyOpacity, {
      toValue: next ? 1 : 0, duration: 250, useNativeDriver: true,
    }).start();
  }, [showHistory, historyOpacity]);

  const orbTint =
    voiceState === 'listening' ? '#10B981'
    : voiceState === 'processing' ? '#3B82F6'
    : voiceState === 'thinking' ? '#A78BFA'
    : voiceState === 'speaking' ? '#22D3EE'
    : '#52525B';

  const stateLabel =
    voiceState === 'idle' ? 'Ready'
    : voiceState === 'listening' ? 'Listening'
    : voiceState === 'processing' ? 'Processing'
    : voiceState === 'thinking' ? 'Thinking'
    : 'Speaking';

  const micBars = barAnims.map((anim, i) => {
    const baseHeight = [16, 28, 22, 38, 32, 40, 26, 34, 18][i];
    const height = voiceState === 'listening' ? baseHeight * (0.4 + micLevel * 0.6) : baseHeight;
    return (
      <Animated.View
        key={i}
        style={[
          styles.bar,
          {
            height,
            opacity: anim,
            backgroundColor: orbTint,
          },
        ]}
      />
    );
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <Animated.View style={[styles.container, { opacity: fadeAnim, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Animated.View style={[styles.bgGlow, {
          opacity: bgPulse,
          backgroundColor: orbTint,
        }]} />

        <View style={styles.topBar}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: orbTint }]} />
            <Text style={styles.statusText}>{stateLabel}</Text>
          </View>
          <View style={styles.topActions}>
            {turns.length > 0 && (
              <TouchableOpacity style={styles.iconBtn} onPress={toggleHistory} activeOpacity={0.7}>
                <ChevronDown
                  size={18}
                  color={Colors.dark.textSecondary}
                  style={{ transform: [{ rotate: showHistory ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.iconBtn, isMuted && styles.iconBtnActive]}
              onPress={toggleMute}
              activeOpacity={0.7}
              testID="voice-mute"
            >
              {isMuted ? <VolumeX size={17} color={Colors.dark.error} /> : <Volume2 size={17} color={Colors.dark.cyan} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7} testID="voice-close">
              <X size={20} color={Colors.dark.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {showHistory && turns.length > 0 && (
          <Animated.View style={[styles.historyContainer, { opacity: historyOpacity }]}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={styles.historyScroll}>
              {turns.map((turn, i) => (
                <View key={i} style={[styles.turnBubble, turn.role === 'user' ? styles.userTurn : styles.assistantTurn]}>
                  <Text style={[styles.turnLabel, { color: turn.role === 'user' ? Colors.dark.accent : Colors.dark.cyan }]}>
                    {turn.role === 'user' ? 'You' : 'AI'}
                  </Text>
                  <Text style={styles.turnText} numberOfLines={4}>{turn.text}</Text>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <View style={styles.orbArea}>
          <Animated.View style={[styles.haloRing, {
            transform: [{ scale: haloScale }],
            opacity: haloOpacity,
            borderColor: orbTint,
          }]} />
          <Animated.View style={[styles.haloRing, {
            transform: [{ scale: halo2Scale }],
            opacity: halo2Opacity,
            borderColor: orbTint,
          }]} />
          <Animated.View style={[styles.haloRing, {
            transform: [{ scale: halo3Scale }],
            opacity: halo3Opacity,
            borderColor: orbTint,
          }]} />

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOrbPress}
            disabled={voiceState === 'processing' || voiceState === 'thinking'}
          >
            <Animated.View style={[styles.orbShell, { transform: [{ scale: orbScale }] }]}>
              <Animated.View style={[styles.orbGlowBg, { opacity: innerGlow, backgroundColor: orbTint }]} />
              <Animated.View style={[styles.orbSurface, { borderColor: orbTint, opacity: orbOpacity }]}>
                {voiceState === 'listening' ? (
                  <View style={styles.barsRow}>{micBars}</View>
                ) : voiceState === 'speaking' ? (
                  <View style={styles.barsRow}>
                    {speakWave.map((w, i) => (
                      <Animated.View key={i} style={[styles.speakBar, {
                        height: [20, 32, 44, 36, 24][i],
                        opacity: w,
                        backgroundColor: orbTint,
                      }]} />
                    ))}
                  </View>
                ) : voiceState === 'thinking' || voiceState === 'processing' ? (
                  <View style={styles.dotsRow}>
                    {dotAnims.map((d, i) => (
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
          ) : voiceState === 'listening' ? (
            <Text style={styles.hintLabel}>Listening...</Text>
          ) : voiceState === 'idle' ? (
            <Text style={styles.hintLabel}>Tap to speak</Text>
          ) : null}
          {transcript && (voiceState === 'thinking' || voiceState === 'speaking') && (
            <Text style={styles.transcriptLabel}>You said: "{transcript}"</Text>
          )}
        </View>

        <View style={styles.bottomBar}>
          {voiceState === 'speaking' && (
            <Text style={styles.bottomHint}>Tap orb to interrupt</Text>
          )}
          {voiceState === 'idle' && (
            <Text style={styles.bottomHint}>Conversation flows automatically</Text>
          )}
          {voiceState === 'listening' && (
            <TouchableOpacity
              style={styles.endBtn}
              onPress={() => {
                cleanupAll();
                setVoiceState('idle');
                setTranscript('');
                setDisplayText('');
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
  container: {
    flex: 1,
    backgroundColor: '#050507',
    justifyContent: 'space-between',
  },
  bgGlow: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.2,
    left: SCREEN_WIDTH * 0.1,
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4,
    transform: [{ scaleY: 1.3 }],
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContainer: {
    maxHeight: 180,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 10,
  },
  historyScroll: {
    flex: 1,
  },
  turnBubble: {
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  userTurn: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    alignSelf: 'flex-end' as const,
    maxWidth: '85%' as const,
  },
  assistantTurn: {
    backgroundColor: 'rgba(34,211,238,0.08)',
    alignSelf: 'flex-start' as const,
    maxWidth: '85%' as const,
  },
  turnLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
    textTransform: 'uppercase' as const,
  },
  turnText: {
    color: '#D4D4D8',
    fontSize: 13,
    lineHeight: 18,
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloRing: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 1,
  },
  orbShell: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlowBg: {
    position: 'absolute',
    width: ORB_SIZE + 50,
    height: ORB_SIZE + 50,
    borderRadius: (ORB_SIZE + 50) / 2,
  },
  orbSurface: {
    width: ORB_SIZE - 6,
    height: ORB_SIZE - 6,
    borderRadius: (ORB_SIZE - 6) / 2,
    borderWidth: 1.5,
    backgroundColor: '#0A0A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  speakBar: {
    width: 5,
    borderRadius: 3,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  textArea: {
    paddingHorizontal: 28,
    alignItems: 'center',
    minHeight: 100,
  },
  displayText: {
    color: '#E4E4E7',
    fontSize: 16,
    textAlign: 'center' as const,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center' as const,
  },
  hintLabel: {
    color: '#71717A',
    fontSize: 15,
    fontWeight: '500' as const,
  },
  transcriptLabel: {
    color: '#52525B',
    fontSize: 12,
    textAlign: 'center' as const,
    marginTop: 10,
    fontStyle: 'italic' as const,
  },
  bottomBar: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    minHeight: 44,
  },
  bottomHint: {
    color: '#3F3F46',
    fontSize: 12,
  },
  endBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
  },
  endBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
