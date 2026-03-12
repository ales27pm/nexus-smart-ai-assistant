import { useRef, useCallback, useEffect } from "react";
import { Animated, Easing } from "react-native";

export type VoiceState = "idle" | "listening" | "processing" | "thinking" | "speaking";

const ORB_SIZE = 160;

export function useVoiceAnimations(voiceState: VoiceState, _micLevel?: number) {
  const orbScale = useRef(new Animated.Value(1)).current;
  const orbOpacity = useRef(new Animated.Value(0.6)).current;
  const haloScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const halo2Scale = useRef(new Animated.Value(1)).current;
  const halo2Opacity = useRef(new Animated.Value(0)).current;
  const halo3Scale = useRef(new Animated.Value(1)).current;
  const halo3Opacity = useRef(new Animated.Value(0)).current;
  const innerGlow = useRef(new Animated.Value(0.4)).current;
  const barAnims = useRef(
    Array.from({ length: 9 }, () => new Animated.Value(0.15)),
  ).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bgPulse = useRef(new Animated.Value(0)).current;
  const dotAnims = useRef(
    Array.from({ length: 3 }, () => new Animated.Value(0.3)),
  ).current;
  const speakWave = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.2)),
  ).current;
  const historyOpacity = useRef(new Animated.Value(0)).current;
  const animLoopsRef = useRef<Animated.CompositeAnimation[]>([]);

  const stopAllAnims = useCallback(() => {
    animLoopsRef.current.forEach((a) => a.stop());
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
    barAnims.forEach((b) => b.setValue(0.15));
    startLoop(
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.04, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.96, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
  }, [barAnims, bgPulse, halo2Opacity, halo3Opacity, haloOpacity, innerGlow, orbOpacity, orbScale, startLoop]);

  const animateListening = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.8, duration: 250, useNativeDriver: true }).start();
    Animated.timing(bgPulse, { toValue: 0.3, duration: 400, useNativeDriver: true }).start();
    startLoop(
      Animated.loop(
        Animated.stagger(180, [
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
        ]),
      ),
    );
    barAnims.forEach((b, i) => {
      startLoop(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 60),
            Animated.timing(b, { toValue: 0.9 + Math.random() * 0.1, duration: 200 + Math.random() * 200, useNativeDriver: true }),
            Animated.timing(b, { toValue: 0.15 + Math.random() * 0.2, duration: 200 + Math.random() * 200, useNativeDriver: true }),
          ]),
        ),
      );
    });
  }, [barAnims, bgPulse, halo2Opacity, halo2Scale, halo3Opacity, halo3Scale, haloOpacity, haloScale, innerGlow, orbOpacity, startLoop]);

  const animateProcessing = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 0.7, duration: 200, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.6, duration: 200, useNativeDriver: true }).start();
    haloOpacity.setValue(0);
    halo2Opacity.setValue(0);
    halo3Opacity.setValue(0);
    Animated.timing(bgPulse, { toValue: 0.15, duration: 300, useNativeDriver: true }).start();
    startLoop(
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.06, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.94, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    dotAnims.forEach((d, i) => {
      startLoop(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 250),
            Animated.timing(d, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.2, duration: 400, useNativeDriver: true }),
          ]),
        ),
      );
    });
  }, [bgPulse, dotAnims, halo2Opacity, halo3Opacity, haloOpacity, innerGlow, orbOpacity, orbScale, startLoop]);

  const animateThinking = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.7, duration: 300, useNativeDriver: true }).start();
    haloOpacity.setValue(0);
    halo2Opacity.setValue(0);
    halo3Opacity.setValue(0);
    Animated.timing(bgPulse, { toValue: 0.2, duration: 400, useNativeDriver: true }).start();
    startLoop(
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.05, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.95, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    dotAnims.forEach((d, i) => {
      startLoop(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 300),
            Animated.timing(d, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.15, duration: 500, useNativeDriver: true }),
          ]),
        ),
      );
    });
  }, [bgPulse, dotAnims, halo2Opacity, halo3Opacity, haloOpacity, innerGlow, orbOpacity, orbScale, startLoop]);

  const animateSpeaking = useCallback(() => {
    Animated.timing(orbOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    Animated.timing(innerGlow, { toValue: 0.9, duration: 200, useNativeDriver: true }).start();
    Animated.timing(bgPulse, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
    startLoop(
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.08, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.92, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    startLoop(
      Animated.loop(
        Animated.stagger(150, [
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
        ]),
      ),
    );
    speakWave.forEach((w, i) => {
      startLoop(
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 80),
            Animated.timing(w, { toValue: 0.8 + Math.random() * 0.2, duration: 250 + i * 30, useNativeDriver: true }),
            Animated.timing(w, { toValue: 0.15 + Math.random() * 0.15, duration: 250 + i * 30, useNativeDriver: true }),
          ]),
        ),
      );
    });
  }, [bgPulse, halo2Opacity, halo2Scale, haloOpacity, haloScale, innerGlow, orbOpacity, orbScale, speakWave, startLoop]);

  useEffect(() => {
    stopAllAnims();
    switch (voiceState) {
      case "idle": animateIdle(); break;
      case "listening": animateListening(); break;
      case "processing": animateProcessing(); break;
      case "thinking": animateThinking(); break;
      case "speaking": animateSpeaking(); break;
    }
    return () => stopAllAnims();
  }, [voiceState, stopAllAnims, animateIdle, animateListening, animateProcessing, animateThinking, animateSpeaking]);

  const resetForOpen = useCallback(() => {
    orbScale.setValue(1);
    orbOpacity.setValue(0.6);
    fadeAnim.setValue(0);
  }, [orbScale, orbOpacity, fadeAnim]);

  const orbTint =
    voiceState === "listening" ? "#10B981" :
    voiceState === "processing" ? "#3B82F6" :
    voiceState === "thinking" ? "#A78BFA" :
    voiceState === "speaking" ? "#22D3EE" : "#52525B";

  const stateLabel =
    voiceState === "idle" ? "Ready" :
    voiceState === "listening" ? "Listening" :
    voiceState === "processing" ? "Processing" :
    voiceState === "thinking" ? "Thinking" : "Speaking";

  const BAR_HEIGHTS = [16, 28, 22, 38, 32, 40, 26, 34, 18] as const;
  const SPEAK_HEIGHTS = [20, 32, 44, 36, 24] as const;

  return {
    orbScale, orbOpacity, innerGlow, fadeAnim, bgPulse, historyOpacity,
    haloScale, haloOpacity, halo2Scale, halo2Opacity, halo3Scale, halo3Opacity,
    barAnims, dotAnims, speakWave,
    orbTint, stateLabel, resetForOpen, stopAllAnims,
    BAR_HEIGHTS, SPEAK_HEIGHTS, ORB_SIZE,
  };
}
