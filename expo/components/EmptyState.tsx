import React from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ArrowRight, Sparkles } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { Typography } from "@/constants/typography";
import { EmptyStateBackground } from "@/components/empty-state/EmptyStateBackground";
import { useEmptyStateAnimations } from "@/hooks/useEmptyStateAnimations";

const QUICK_STARTS = [
  "Plan my top 3 priorities for today",
  "Summarize the most important AI news",
];

interface EmptyStateProps {
  onSuggestion?: (text: string) => void;
}

export default function EmptyState({ onSuggestion }: EmptyStateProps) {
  const { entranceOpacity, entranceY, auraOpacity, markScale } =
    useEmptyStateAnimations();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <EmptyStateBackground />

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

        {onSuggestion ? (
          <View style={styles.ctaGroup}>
            {QUICK_STARTS.map((prompt) => (
              <Pressable
                key={prompt}
                style={styles.cta}
                onPress={() => {
                  void Haptics.impactAsync(
                    Haptics.ImpactFeedbackStyle.Light,
                  ).catch(() => {});
                  onSuggestion(prompt);
                }}
              >
                <Text style={styles.ctaText}>{prompt}</Text>
                <ArrowRight size={16} color={Colors.dark.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: Colors.dark.background,
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
    fontFamily: Typography.serifDisplay,
    color: Colors.dark.text,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: 3.5,
    marginBottom: 12,
  },
  headline: {
    fontFamily: Typography.display,
    color: Colors.dark.text,
    fontSize: 28,
    lineHeight: 34,
    maxWidth: 480,
    textAlign: "center",
    marginBottom: 10,
  },
  support: {
    fontFamily: Typography.body,
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
    fontFamily: Typography.body,
    fontSize: 16,
    lineHeight: 22,
  },
});
