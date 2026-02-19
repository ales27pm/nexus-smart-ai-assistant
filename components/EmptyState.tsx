import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import {
  Sparkles,
  Globe,
  Brain,
  Search,
  Zap,
  ImageIcon,
  Calculator,
  ListChecks,
  FileText,
  LinkIcon,
} from 'lucide-react-native';
import Colors from '@/constants/colors';

const CAPABILITIES = [
  { icon: Globe, label: 'Web Search', color: Colors.dark.toolWebSearch },
  { icon: LinkIcon, label: 'Web Scrape', color: Colors.dark.toolWebScrape },
  { icon: Brain, label: 'Store Memory', color: Colors.dark.toolMemoryStore },
  { icon: Search, label: 'Recall Memory', color: Colors.dark.toolMemoryRecall },
  { icon: Zap, label: 'Deep Analysis', color: Colors.dark.toolAnalysis },
  { icon: ImageIcon, label: 'Image Gen', color: Colors.dark.toolImageGen },
  { icon: Calculator, label: 'Calculator', color: Colors.dark.toolCalculator },
  { icon: ListChecks, label: 'Task Planner', color: Colors.dark.toolTaskPlan },
  { icon: FileText, label: 'Summarize', color: Colors.dark.toolSummarize },
];

export default function EmptyState() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [fadeAnim, slideAnim, glowAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.logoGlow, { opacity: glowAnim }]} />
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Sparkles size={26} color={Colors.dark.accent} />
          </View>
        </View>
      </View>

      <Text style={styles.title}>NEXUS</Text>
      <Text style={styles.subtitle}>Context-Aware AI Agent</Text>
      <Text style={styles.version}>TF-IDF Memory · Auto-Extract · Tool Orchestration</Text>

      <View style={styles.capsGrid}>
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <View key={i} style={styles.capItem}>
              <View style={[styles.capIcon, { backgroundColor: cap.color + '12' }]}>
                <Icon size={13} color={cap.color} />
              </View>
              <Text style={styles.capLabel}>{cap.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.hintBox}>
        <Text style={styles.hintTitle}>How it works</Text>
        <Text style={styles.hintItem}>→ Memories persist across sessions via semantic search</Text>
        <Text style={styles.hintItem}>→ Important facts are auto-extracted and stored</Text>
        <Text style={styles.hintItem}>→ Tools chain together for complex tasks</Text>
        <Text style={styles.hintItem}>→ Context window is optimized per message</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 20,
  },
  logoWrap: {
    marginBottom: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.dark.accent,
  },
  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.dark.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.dark.text,
    letterSpacing: 5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  version: {
    fontSize: 10,
    color: Colors.dark.textTertiary,
    marginBottom: 22,
    letterSpacing: 0.3,
  },
  capsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 22,
  },
  capItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  capIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  hintBox: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    width: '100%',
  },
  hintTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hintItem: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    lineHeight: 20,
  },
});
