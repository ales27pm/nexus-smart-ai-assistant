import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Sparkles, Globe, Brain, Zap, Search } from 'lucide-react-native';
import Colors from '@/constants/colors';

const CAPABILITIES = [
  { icon: Globe, label: 'Web Search & Scraping', color: Colors.dark.toolWebSearch },
  { icon: Brain, label: 'Semantic Memory', color: Colors.dark.toolMemoryStore },
  { icon: Search, label: 'Memory Recall', color: Colors.dark.toolMemoryRecall },
  { icon: Zap, label: 'Deep Analysis', color: Colors.dark.toolAnalysis },
];

export default function EmptyState() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.logoWrap}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Sparkles size={28} color={Colors.dark.accent} />
          </View>
        </View>
      </View>

      <Text style={styles.title}>NEXUS</Text>
      <Text style={styles.subtitle}>AI Agent with Semantic Memory</Text>

      <View style={styles.capsGrid}>
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <View key={i} style={styles.capItem}>
              <View style={[styles.capIcon, { backgroundColor: cap.color + '15' }]}>
                <Icon size={16} color={cap.color} />
              </View>
              <Text style={styles.capLabel}>{cap.label}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.hint}>Ask me anything — I learn and remember across sessions</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  logoWrap: {
    marginBottom: 20,
  },
  logoOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.dark.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.dark.text,
    letterSpacing: 4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 28,
  },
  capsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
  },
  capItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  capIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  hint: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
  },
});
