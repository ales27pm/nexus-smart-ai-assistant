import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Brain, Tag, Trash2, Zap, Star } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useConversations } from '@/providers/ConversationsProvider';
import { MemoryEntry } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  preference: Colors.dark.toolMemoryStore,
  fact: Colors.dark.toolWebSearch,
  instruction: Colors.dark.toolAnalysis,
  context: Colors.dark.toolMemoryRecall,
  goal: Colors.dark.accent,
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  const renderItem = useCallback(({ item }: { item: MemoryEntry }) => {
    const catColor = CATEGORY_COLORS[item.category] ?? Colors.dark.textSecondary;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
            <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
          </View>
          <View style={styles.importanceWrap}>
            {Array.from({ length: item.importance }).map((_, i) => (
              <Star key={i} size={10} color={Colors.dark.warning} fill={Colors.dark.warning} />
            ))}
          </View>
          <TouchableOpacity
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={14} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.cardContent}>{item.content}</Text>
        {item.keywords.length > 0 && (
          <View style={styles.tagsRow}>
            <Tag size={10} color={Colors.dark.textTertiary} />
            <Text style={styles.tagsText}>{item.keywords.join(', ')}</Text>
          </View>
        )}
        <Text style={styles.cardDate}>{formatDate(item.timestamp)}</Text>
      </View>
    );
  }, [handleDelete]);

  const keyExtractor = useCallback((item: MemoryEntry) => item.id, []);

  return (
    <View style={styles.container}>
      {memories.length > 0 && (
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Zap size={14} color={Colors.dark.accent} />
            <Text style={styles.headerCount}>{memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}</Text>
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
              Ask NEXUS to remember things and they'll appear here for future recall
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
  clearBtn: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catText: {
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  importanceWrap: {
    flexDirection: 'row',
    gap: 2,
    flex: 1,
  },
  cardContent: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
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
  cardDate: {
    color: Colors.dark.textTertiary,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
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
