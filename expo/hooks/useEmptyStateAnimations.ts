import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

const MOTION = {
  entrance: {
    fromY: 18,
    durationMs: 520,
  },
  aura: {
    minOpacity: 0.22,
    maxOpacity: 0.42,
    durationMs: 2400,
  },
  mark: {
    minScale: 0.98,
    maxScale: 1.02,
    durationMs: 2600,
  },
} as const;

export function useEmptyStateAnimations() {
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceY = useRef(new Animated.Value(MOTION.entrance.fromY)).current;
  const auraOpacity = useRef(
    new Animated.Value(MOTION.aura.minOpacity),
  ).current;
  const markScale = useRef(new Animated.Value(MOTION.mark.minScale)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: MOTION.entrance.durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entranceY, {
        toValue: 0,
        duration: MOTION.entrance.durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraOpacity, {
          toValue: MOTION.aura.maxOpacity,
          duration: MOTION.aura.durationMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(auraOpacity, {
          toValue: MOTION.aura.minOpacity,
          duration: MOTION.aura.durationMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const markLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(markScale, {
          toValue: MOTION.mark.maxScale,
          duration: MOTION.mark.durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: MOTION.mark.minScale,
          duration: MOTION.mark.durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    auraLoop.start();
    markLoop.start();

    return () => {
      auraLoop.stop();
      markLoop.stop();
    };
  }, [auraOpacity, entranceOpacity, entranceY, markScale]);

  return { entranceOpacity, entranceY, auraOpacity, markScale };
}
