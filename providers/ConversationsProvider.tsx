import { useState, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Conversation, MemoryEntry } from '@/types';
import {
  loadConversationList,
  upsertConversation,
  removeConversation,
  clearAllConversations,
} from '@/utils/conversations';
import {
  loadMemories,
  saveMemories,
  deduplicateMemories,
  consolidateMemories,
  generateId,
} from '@/utils/memory';

export const [ConversationsProvider, useConversations] = createContextHook(() => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: loadConversationList,
  });

  const memoriesQuery = useQuery({
    queryKey: ['memories'],
    queryFn: loadMemories,
  });

  const upsertMutation = useMutation({
    mutationFn: upsertConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: removeConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const clearMutation = useMutation({
    mutationFn: clearAllConversations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveId(null);
    },
  });

  const addMemoryMutation = useMutation({
    mutationFn: async (entry: MemoryEntry) => {
      const current = await loadMemories();
      current.unshift(entry);
      const deduped = deduplicateMemories(current);
      const consolidated = deduped.length > 50 ? consolidateMemories(deduped) : deduped;
      await saveMemories(consolidated);
      console.log('[NEXUS] Memory added. Total:', consolidated.length, '(was', current.length, ')');
      return consolidated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = await loadMemories();
      const filtered = current.filter((m) => m.id !== id);
      await saveMemories(filtered);
      return filtered;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });

  const clearMemoriesMutation = useMutation({
    mutationFn: async () => {
      await saveMemories([]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] }),
  });

  const startNewChat = useCallback(() => {
    const id = generateId();
    setActiveId(id);
    return id;
  }, []);

  return {
    conversations: conversationsQuery.data ?? [],
    memories: memoriesQuery.data ?? [],
    activeId,
    setActiveId,
    startNewChat,
    upsertConversation: upsertMutation.mutate,
    deleteConversation: deleteMutation.mutate,
    clearConversations: clearMutation.mutate,
    addMemory: addMemoryMutation.mutate,
    deleteMemory: deleteMemoryMutation.mutate,
    clearMemories: clearMemoriesMutation.mutate,
    isLoading: conversationsQuery.isLoading,
  };
});
