import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ArrowRight, Sparkles } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const QUICK_STARTS = [
  "Plan my top 3 priorities for today",
  "Summarize the most important AI news",
];

interface EmptyStateProps {
  onSuggestion?: (text: string) => void;
}

export default function EmptyState({ onSuggestion }: EmptyStateProps) {
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceY = useRef(new Animated.Value(18)).current;
  const auraOpacity = useRef(new Animated.Value(0.22)).current;
  const markScale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entranceY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraOpacity, {
          toValue: 0.42,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(auraOpacity, {
          toValue: 0.22,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const markLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(markScale, {
          toValue: 1.02,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: 0.98,
          duration: 2600,
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

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <View style={styles.background} pointerEvents="none">
        <View style={styles.atmosphereTop} />
        <View style={styles.atmosphereBottom} />
      </View>

      <Animated.View
        style={[
          styles.hero,
          {
            opacity: entranceOpacity,
            transform: [{ translateY: entranceY }],
          },
        ]}
      >
        <Animated.View style={[styles.aura, { opacity: auraOpacity }]} />

        <Animated.View
          style={[styles.brandMark, { transform: [{ scale: markScale }] }]}
        >
          <Sparkles size={28} color={Colors.dark.accent} strokeWidth={2.2} />
        </Animated.View>

        <Text style={styles.brand}>NEXUS</Text>
        <Text style={styles.headline}>
          Your local AI cockpit for focused execution.
        </Text>
        <Text style={styles.support}>
          Keep context, reason faster, and turn rough ideas into clear actions.
        </Text>

        <View style={styles.ctaGroup}>
          {QUICK_STARTS.map((prompt) => (
            <Pressable
              key={prompt}
              style={styles.cta}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSuggestion?.(prompt);
              }}
            >
              <Text style={styles.ctaText}>{prompt}</Text>
              <ArrowRight size={16} color={Colors.dark.accent} />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const headingFont = Platform.select({
  ios: "AvenirNext-Bold",
  android: "serif",
  default: "Georgia",
});

const bodyFont = Platform.select({
  ios: "AvenirNext-Regular",
  android: "sans-serif-medium",
  default: "Helvetica",
});

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: Colors.dark.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  atmosphereTop: {
    position: "absolute",
    top: -180,
    left: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
  },
  atmosphereBottom: {
    position: "absolute",
    right: -130,
    bottom: -220,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(251, 191, 36, 0.16)",
  },
  hero: {
    flex: 1,
    minHeight: 580,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  aura: {
    position: "absolute",
    top: "18%",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(16, 185, 129, 0.28)",
  },
  brandMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9, 9, 11, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.55)",
    marginBottom: 20,
  },
  brand: {
    fontFamily: headingFont,
    color: Colors.dark.text,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: 3.5,
    marginBottom: 12,
  },
  headline: {
    fontFamily: headingFont,
    color: Colors.dark.text,
    fontSize: 28,
    lineHeight: 34,
    maxWidth: 480,
    textAlign: "center",
    marginBottom: 10,
  },
  support: {
    fontFamily: bodyFont,
    color: Colors.dark.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 420,
    marginBottom: 28,
  },
  ctaGroup: {
    width: "100%",
    maxWidth: 500,
    gap: 10,
  },
  cta: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(82, 82, 91, 0.9)",
  },
  ctaText: {
    flex: 1,
    paddingRight: 12,
    color: Colors.dark.text,
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 22,
  },
});
