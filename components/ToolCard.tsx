import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import {
  Globe,
  Brain,
  Search,
  Zap,
  LinkIcon,
  ImageIcon,
  Calculator,
  ListChecks,
  FileText,
  Sparkles,
  Heart,
  HelpCircle,
  ShieldQuestion,
} from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ToolCardProps {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

const TOOL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; verb: string }> = {
  webSearch: { label: 'Web Search', color: Colors.dark.toolWebSearch, icon: Globe, verb: 'Searching' },
  storeMemory: { label: 'Store Memory', color: Colors.dark.toolMemoryStore, icon: Brain, verb: 'Storing' },
  recallMemory: { label: 'Recall Memory', color: Colors.dark.toolMemoryRecall, icon: Search, verb: 'Recalling' },
  deepAnalysis: { label: 'Deep Analysis', color: Colors.dark.toolAnalysis, icon: Zap, verb: 'Analyzing' },
  webScrape: { label: 'Web Scrape', color: Colors.dark.toolWebScrape, icon: LinkIcon, verb: 'Scraping' },
  generateImage: { label: 'Image Gen', color: Colors.dark.toolImageGen, icon: ImageIcon, verb: 'Generating' },
  calculator: { label: 'Calculator', color: Colors.dark.toolCalculator, icon: Calculator, verb: 'Calculating' },
  taskPlanner: { label: 'Task Planner', color: Colors.dark.toolTaskPlan, icon: ListChecks, verb: 'Planning' },
  summarize: { label: 'Summarize', color: Colors.dark.toolSummarize, icon: FileText, verb: 'Summarizing' },
  cognitiveAnalysis: { label: 'Cognition Engine', color: Colors.dark.toolCognition, icon: Sparkles, verb: 'Reasoning' },
  emotionalPulse: { label: 'Emotional Pulse', color: Colors.dark.toolEmotion, icon: Heart, verb: 'Sensing' },
  askClarification: { label: 'Clarifying', color: Colors.dark.toolClarification, icon: HelpCircle, verb: 'Asking' },
  admitUncertainty: { label: 'Honesty Check', color: Colors.dark.toolUncertainty, icon: ShieldQuestion, verb: 'Evaluating' },
};

export default React.memo(function ToolCard({ toolName, state, input, output }: ToolCardProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const config = TOOL_CONFIG[toolName] ?? { label: toolName, color: Colors.dark.accent, icon: Zap, verb: 'Running' };
  const IconComp = config.icon;

  const isRunning = state === 'input-streaming' || state === 'input-available';
  const isComplete = state === 'output-available';
  const isError = state === 'output-error';

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    if (isRunning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();

      const progress = Animated.loop(
        Animated.timing(progressAnim, { toValue: 1, duration: 1500, useNativeDriver: false })
      );
      progress.start();

      return () => {
        pulse.stop();
        progress.stop();
      };
    } else {
      pulseAnim.setValue(1);
      progressAnim.setValue(isComplete ? 1 : 0);
    }
  }, [isRunning, isComplete, pulseAnim, progressAnim]);

  const getInputPreview = () => {
    if (!input) return null;
    const val = input.query ?? input.content ?? input.url ?? input.topic ?? input.task ?? input.expression ?? input.prompt;
    if (typeof val === 'string') return val.length > 90 ? val.slice(0, 90) + '…' : val;
    return null;
  };

  const getOutputPreview = () => {
    if (!output) return null;
    if (typeof output === 'string') return output.length > 140 ? output.slice(0, 140) + '…' : output;
    if (typeof output === 'object' && output !== null) {
      const str = JSON.stringify(output);
      return str.length > 140 ? str.slice(0, 140) + '…' : str;
    }
    return null;
  };

  const borderColor = isError ? Colors.dark.error : config.color;
  const inputPreview = getInputPreview();
  const outputPreview = getOutputPreview();

  const statusLabel = isRunning
    ? `${config.verb}...`
    : isComplete
    ? 'Done'
    : isError
    ? 'Failed'
    : 'Queued';

  const statusColor = isComplete
    ? Colors.dark.accent
    : isError
    ? Colors.dark.error
    : borderColor;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderLeftColor: borderColor,
          opacity: isRunning ? pulseAnim : 1,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: borderColor + '18' }]}>
          <IconComp size={13} color={borderColor} />
        </View>
        <Text style={[styles.label, { color: borderColor }]}>{config.label}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {isRunning && (
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: borderColor,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['5%', '85%'],
                }),
              },
            ]}
          />
        </View>
      )}

      {inputPreview && (
        <View style={styles.previewWrap}>
          <Text style={styles.previewLabel}>Input</Text>
          <Text style={styles.previewText} numberOfLines={2}>{inputPreview}</Text>
        </View>
      )}
      {isComplete && outputPreview && (
        <View style={styles.previewWrap}>
          <Text style={[styles.previewLabel, { color: Colors.dark.accent }]}>Result</Text>
          <Text style={styles.previewText} numberOfLines={3}>{outputPreview}</Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 10,
    marginVertical: 3,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
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
  progressTrack: {
    height: 2,
    backgroundColor: Colors.dark.border,
    borderRadius: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
    borderRadius: 1,
  },
  previewWrap: {
    marginTop: 7,
    backgroundColor: Colors.dark.surface,
    borderRadius: 6,
    padding: 8,
  },
  previewLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  previewText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});
