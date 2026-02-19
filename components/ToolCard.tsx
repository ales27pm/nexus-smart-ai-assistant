import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Globe, Brain, Search, Zap, LinkIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ToolCardProps {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

const TOOL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  webSearch: { label: 'Web Search', color: Colors.dark.toolWebSearch, icon: Globe },
  storeMemory: { label: 'Store Memory', color: Colors.dark.toolMemoryStore, icon: Brain },
  recallMemory: { label: 'Recall Memory', color: Colors.dark.toolMemoryRecall, icon: Search },
  deepAnalysis: { label: 'Deep Analysis', color: Colors.dark.toolAnalysis, icon: Zap },
  webScrape: { label: 'Web Scrape', color: Colors.dark.toolWebScrape, icon: LinkIcon },
};

export default function ToolCard({ toolName, state, input, output }: ToolCardProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const config = TOOL_CONFIG[toolName] ?? { label: toolName, color: Colors.dark.accent, icon: Zap };
  const IconComp = config.icon;

  const isRunning = state === 'input-streaming' || state === 'input-available';
  const isComplete = state === 'output-available';
  const isError = state === 'output-error';

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    if (isRunning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning, pulseAnim]);

  const getStatusText = () => {
    if (isRunning) return 'Executing...';
    if (isComplete) return 'Completed';
    if (isError) return 'Failed';
    return 'Pending';
  };

  const getInputPreview = () => {
    if (!input) return null;
    const query = input.query ?? input.content ?? input.url ?? input.topic;
    if (typeof query === 'string') return query.length > 80 ? query.slice(0, 80) + '...' : query;
    return null;
  };

  const getOutputPreview = () => {
    if (!output) return null;
    if (typeof output === 'string') return output.length > 120 ? output.slice(0, 120) + '...' : output;
    if (typeof output === 'object' && output !== null) {
      const str = JSON.stringify(output);
      return str.length > 120 ? str.slice(0, 120) + '...' : str;
    }
    return null;
  };

  const borderColor = isError ? Colors.dark.error : config.color;
  const inputPreview = getInputPreview();
  const outputPreview = getOutputPreview();

  return (
    <Animated.View
      style={[
        styles.container,
        { borderLeftColor: borderColor, opacity: pulseAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: borderColor + '20' }]}>
          <IconComp size={14} color={borderColor} />
        </View>
        <Text style={styles.label}>{config.label}</Text>
        <View style={[styles.statusBadge, { backgroundColor: isComplete ? Colors.dark.accentGlow : isError ? Colors.dark.errorDim : borderColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: isComplete ? Colors.dark.accent : isError ? Colors.dark.error : borderColor }]} />
          <Text style={[styles.statusText, { color: isComplete ? Colors.dark.accent : isError ? Colors.dark.error : borderColor }]}>{getStatusText()}</Text>
        </View>
      </View>
      {inputPreview && (
        <View style={styles.previewWrap}>
          <Text style={styles.previewLabel}>Input</Text>
          <Text style={styles.previewText} numberOfLines={2}>{inputPreview}</Text>
        </View>
      )}
      {isComplete && outputPreview && (
        <View style={styles.previewWrap}>
          <Text style={styles.previewLabel}>Result</Text>
          <Text style={styles.previewText} numberOfLines={3}>{outputPreview}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  previewWrap: {
    marginTop: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 6,
    padding: 8,
  },
  previewLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  previewText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});
