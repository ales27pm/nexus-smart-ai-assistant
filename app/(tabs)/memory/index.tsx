import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Brain, Tag, Trash2, Zap, Star, Activity, Eye } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useConversations } from '@/providers/ConversationsProvider';
import { MemoryEntry, MemoryCategory } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  preference: Colors.dark.toolMemoryStore,
  fact: Colors.dark.toolWebSearch,
  instruction: Colors.dark.toolAnalysis,
  context: Colors.dark.toolMemoryRecall,
  goal: Colors.dark.accent,
  persona: Colors.dark.rose,
  skill: Colors.dark.toolCodeEval,
  entity: Colors.dark.cyan,
  episodic: Colors.dark.toolTaskPlan,
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDecay(decay: number): string {
  if (decay > 0.8) return 'Strong';
  if (decay > 0.5) return 'Active';
  if (decay > 0.2) return 'Fading';
  return 'Weak';
}

function getDecayColor(decay: number): string {
  if (decay > 0.8) return Colors.dark.accent;
  if (decay > 0.5) return Colors.dark.warning;
  if (decay > 0.2) return Colors.dark.toolWebScrape;
  return Colors.dark.textTertiary;
}

export default function MemoryScreen() {
  const { memories, deleteMemory, clearMemories } = useConversations();

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Memory', 'Remove this memory entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMemory(id) },
    ]);
  }, [deleteMemory]);

  const handleClearAll = useCallback(() => {
    if (memories.length === 0) return;
    Alert.alert('Clear Memory Bank', 'This will erase all stored memories.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase All', style: 'destructive', onPress: () => clearMemories() },
    ]);
  }, [memories.length, clearMemories]);

  const autoCount = memories.filter((m) => m.source === 'auto-extract').length;
  const manualCount = memories.length - autoCount;

  const renderItem = useCallback(({ item }: { item: MemoryEntry }) => {
    const catColor = CATEGORY_COLORS[item.category] ?? Colors.dark.textSecondary;
    const decay = item.decay ?? 1.0;
    const decayColor = getDecayColor(decay);
    const isAutoExtracted = item.source === 'auto-extract';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '18' }]}>
            <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
          </View>
          {isAutoExtracted && (
            <View style={[styles.sourceBadge]}>
              <Zap size={8} color={Colors.dark.toolImageGen} />
              <Text style={styles.sourceText}>auto</Text>
            </View>
          )}
          <View style={styles.importanceWrap}>
            {Array.from({ length: Math.min(item.importance, 5) }).map((_, i) => (
              <Star key={i} size={9} color={Colors.dark.warning} fill={Colors.dark.warning} />
            ))}
          </View>
          <TouchableOpacity
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={13} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.cardContent} selectable>{item.content}</Text>

        {item.keywords.length > 0 && (
          <View style={styles.tagsRow}>
            <Tag size={9} color={Colors.dark.textTertiary} />
            <Text style={styles.tagsText} numberOfLines={1}>{item.keywords.join(', ')}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.footerMeta}>
            <Activity size={9} color={decayColor} />
            <Text style={[styles.decayText, { color: decayColor }]}>{formatDecay(decay)}</Text>
          </View>
          <View style={styles.footerMeta}>
            <Eye size={9} color={Colors.dark.textTertiary} />
            <Text style={styles.accessText}>{item.accessCount ?? 0}×</Text>
          </View>
          <Text style={styles.cardDate}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>
    );
  }, [handleDelete]);

  const keyExtractor = useCallback((item: MemoryEntry) => item.id, []);

  return (
    <View style={styles.container}>
      {memories.length > 0 && (
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Brain size={14} color={Colors.dark.accent} />
            <Text style={styles.headerCount}>
              {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}
            </Text>
            {autoCount > 0 && (
              <Text style={styles.headerAuto}>({autoCount} auto)</Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearBtn}>Erase All</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={memories}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={memories.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Brain size={32} color={Colors.dark.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Memory Bank Empty</Text>
            <Text style={styles.emptySubtitle}>
              NEXUS auto-extracts important facts from conversations and stores them here for future recall
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCount: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  headerAuto: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
  },
  clearBtn: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  card: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  catBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  catText: {
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.dark.accentSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 8,
    color: Colors.dark.toolImageGen,
    fontWeight: '600' as const,
  },
  importanceWrap: {
    flexDirection: 'row',
    gap: 1,
    flex: 1,
  },
  cardContent: {
    color: Colors.dark.text,
    fontSize: 13,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  tagsText: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.borderSubtle,
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  decayText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  accessText: {
    fontSize: 10,
    color: Colors.dark.textTertiary,
  },
  cardDate: {
    color: Colors.dark.textTertiary,
    fontSize: 10,
    marginLeft: 'auto',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '600' as const,
    marginBottom: 6,
  },
  emptySubtitle: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
