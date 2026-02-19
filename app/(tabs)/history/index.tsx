import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Trash2, Clock, ChevronRight } from 'lucide-react-native';
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

export default function HistoryScreen() {
  const { conversations, setActiveId, deleteConversation, clearConversations } = useConversations();
  const router = useRouter();

  const handleOpen = useCallback((conv: Conversation) => {
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
      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={() => handleDelete(item.id)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.deleteBtn}
        >
          <Trash2 size={15} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
        <ChevronRight size={16} color={Colors.dark.textTertiary} />
      </View>
    </TouchableOpacity>
  ), [handleOpen, handleDelete]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  return (
    <View style={styles.container}>
      {conversations.length > 0 && (
        <View style={styles.headerRow}>
          <Text style={styles.headerCount}>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearBtn}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <MessageSquare size={32} color={Colors.dark.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>Start a chat to see your history here</Text>
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
  clearBtn: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  listContent: {
    paddingVertical: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
    gap: 12,
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteBtn: {
    padding: 4,
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
  },
});
