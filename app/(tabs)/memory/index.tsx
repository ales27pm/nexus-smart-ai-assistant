import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { Brain, Tag, Trash2, Zap, Star, Activity, Eye, Search, X, Filter } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
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

const ALL_CATEGORIES: MemoryCategory[] = [
  'preference', 'fact', 'instruction', 'context', 'goal', 'persona', 'skill', 'entity', 'episodic',
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = memories;
    if (selectedCategory) {
      result = result.filter(m => m.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.keywords.some(k => k.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [memories, searchQuery, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memories) {
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    }
    return counts;
  }, [memories]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Memory', 'Remove this memory entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        deleteMemory(id);
      }},
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
            <View style={styles.sourceBadge}>
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
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            {showSearch ? (
              <View style={styles.searchRow}>
                <Search size={14} color={Colors.dark.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search memories..."
                  placeholderTextColor={Colors.dark.textTertiary}
                  autoFocus
                  testID="memory-search"
                />
                <TouchableOpacity
                  onPress={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={16} color={Colors.dark.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.headerLeft}>
                  <Brain size={14} color={Colors.dark.accent} />
                  <Text style={styles.headerCount}>
                    {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}
                  </Text>
                  {autoCount > 0 && (
                    <Text style={styles.headerAuto}>({autoCount} auto)</Text>
                  )}
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    onPress={() => setShowSearch(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Search size={16} color={Colors.dark.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowFilters(!showFilters)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Filter
                      size={16}
                      color={selectedCategory ? Colors.dark.accent : Colors.dark.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClearAll}>
                    <Text style={styles.clearBtn}>Erase All</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {showFilters && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !selectedCategory && styles.filterChipActive,
                ]}
                onPress={() => {
                  setSelectedCategory(null);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterChipText,
                  !selectedCategory && styles.filterChipTextActive,
                ]}>
                  All ({memories.length})
                </Text>
              </TouchableOpacity>
              {ALL_CATEGORIES.map(cat => {
                const count = categoryCounts.get(cat) ?? 0;
                if (count === 0) return null;
                const isActive = selectedCategory === cat;
                const catColor = CATEGORY_COLORS[cat] ?? Colors.dark.textSecondary;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.filterChip,
                      isActive && { backgroundColor: catColor + '20', borderColor: catColor },
                    ]}
                    onPress={() => {
                      setSelectedCategory(isActive ? null : cat);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.filterChipText,
                      isActive && { color: catColor },
                    ]}>
                      {cat} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Brain size={32} color={Colors.dark.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery || selectedCategory ? 'No matches' : 'Memory Bank Empty'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedCategory
                ? 'Try different search terms or filters'
                : 'NEXUS auto-extracts important facts from conversations and stores them here for future recall'}
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
  headerSection: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    paddingVertical: 2,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.accentGlow,
    borderColor: Colors.dark.accent,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  filterChipTextActive: {
    color: Colors.dark.accent,
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
    textAlign: 'center' as const,
    lineHeight: 20,
  },
});
