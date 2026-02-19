import React, { useCallback, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Trash2, Clock, ChevronRight, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useConversations } from '@/providers/ConversationsProvider';
import { Conversation } from '@/types';

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          const clampedX = Math.max(gestureState.dx, -100);
          translateX.setValue(clampedX);
          deleteOpacity.setValue(Math.min(1, Math.abs(clampedX) / 60));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -70) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(translateX, {
            toValue: -100,
            duration: 150,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 8,
          }).start();
          Animated.timing(deleteOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleDelete = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDelete();
    });
  }, [onDelete, translateX]);

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.deleteBackground, { opacity: deleteOpacity }]}>
        <TouchableOpacity style={styles.deleteAction} onPress={handleDelete} activeOpacity={0.7}>
          <Trash2 size={18} color="#fff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default function HistoryScreen() {
  const { conversations, setActiveId, deleteConversation, clearConversations } = useConversations();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.preview ?? '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const handleOpen = useCallback((conv: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveId(conv.id);
    router.navigate('/(tabs)/(chat)' as any);
  }, [setActiveId, router]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Conversation', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(id) },
    ]);
  }, [deleteConversation]);

  const handleClearAll = useCallback(() => {
    if (conversations.length === 0) return;
    Alert.alert('Clear All History', 'Delete all conversations?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => clearConversations() },
    ]);
  }, [conversations.length, clearConversations]);

  const renderItem = useCallback(({ item }: { item: Conversation }) => (
    <SwipeableRow onDelete={() => handleDelete(item.id)}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleOpen(item)}
        activeOpacity={0.7}
        testID={`conv-${item.id}`}
      >
        <View style={styles.cardIcon}>
          <MessageSquare size={18} color={Colors.dark.accent} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {item.preview ? (
            <Text style={styles.cardPreview} numberOfLines={2}>{item.preview}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <Clock size={11} color={Colors.dark.textTertiary} />
            <Text style={styles.cardTime}>{formatTime(item.timestamp)}</Text>
            <Text style={styles.cardCount}>{item.messageCount} messages</Text>
          </View>
        </View>
        <ChevronRight size={16} color={Colors.dark.textTertiary} />
      </TouchableOpacity>
    </SwipeableRow>
  ), [handleOpen, handleDelete]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  return (
    <View style={styles.container}>
      {conversations.length > 0 && (
        <View style={styles.headerRow}>
          {showSearch ? (
            <View style={styles.searchRow}>
              <Search size={14} color={Colors.dark.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search conversations..."
                placeholderTextColor={Colors.dark.textTertiary}
                autoFocus
                testID="history-search"
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
              <Text style={styles.headerCount}>
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
              </Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => setShowSearch(true)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Search size={16} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClearAll}>
                  <Text style={styles.clearBtn}>Clear All</Text>
                </TouchableOpacity>
              </View>
            </>
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
              <MessageSquare size={32} color={Colors.dark.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No matches found' : 'No conversations yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Try a different search term'
                : 'Start a chat to see your history here'}
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
  headerCount: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
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
  clearBtn: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  listContent: {
    paddingVertical: 4,
  },
  swipeContainer: {
    overflow: 'hidden',
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 100,
    backgroundColor: Colors.dark.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
    gap: 12,
    backgroundColor: Colors.dark.background,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.dark.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  cardPreview: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardTime: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
  },
  cardCount: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    marginLeft: 8,
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
  },
});
