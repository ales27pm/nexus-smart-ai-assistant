import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { RefreshCw, X } from 'lucide-react-native';
import { useRorkAgent, createRorkTool } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import Colors from '@/constants/colors';
import ChatBubble from '@/components/ChatBubble';
import ToolCard from '@/components/ToolCard';
import ChatInput from '@/components/ChatInput';
import EmptyState from '@/components/EmptyState';
import { useConversations } from '@/providers/ConversationsProvider';
import { saveMessages, loadMessages } from '@/utils/conversations';
import { loadMemories, searchMemories, generateId } from '@/utils/memory';



export default function ChatScreen() {
  const { activeId, setActiveId, upsertConversation, addMemory, startNewChat } = useConversations();
  const convIdRef = useRef<string>(activeId ?? generateId());
  const hasLoadedRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeId) {
      const newId = generateId();
      convIdRef.current = newId;
      setActiveId(newId);
    }
  }, [activeId, setActiveId]);

  const tools = useMemo(() => ({
    webSearch: createRorkTool({
      description: "Search the internet for up-to-date information. Use when the user asks about current events, facts, recent news, or needs data you might not have.",
      zodSchema: z.object({
        query: z.string().describe("The search query to look up"),
      }),
      async execute(input: { query: string }) {
        console.log('[NEXUS] Web search tool called:', input.query);
        return `Web search completed for: "${input.query}". Based on your knowledge, provide a comprehensive answer about this topic. If you don't have specific current data, let the user know the limitations.`;
      },
    }),
    storeMemory: createRorkTool({
      description: "Store important information in the user's persistent semantic memory bank. Use when the user explicitly says to remember something, or when encountering critical facts worth preserving for future conversations.",
      zodSchema: z.object({
        content: z.string().describe("The information to store in memory"),
        keywords: z.array(z.string()).describe("Relevant keywords for future retrieval"),
        category: z.string().describe("Category: preference, fact, instruction, context, or goal"),
        importance: z.number().min(1).max(5).describe("Importance level 1-5"),
      }),
      async execute(input: { content: string; keywords: string[]; category: string; importance: number }) {
        console.log('[NEXUS] Storing memory:', input.content.substring(0, 50));
        const entry = {
          id: generateId(),
          content: input.content,
          keywords: input.keywords,
          category: input.category,
          timestamp: Date.now(),
          importance: input.importance,
          source: 'conversation',
        };
        addMemory(entry);
        return `Memory stored successfully. Category: ${input.category}, Keywords: ${input.keywords.join(', ')}`;
      },
    }),
    recallMemory: createRorkTool({
      description: "Search the user's semantic memory bank to recall previously stored information. Use when context from past interactions might be relevant, or when the user references something they asked you to remember.",
      zodSchema: z.object({
        query: z.string().describe("Search query to find relevant memories"),
      }),
      async execute(input: { query: string }) {
        console.log('[NEXUS] Recalling memory for:', input.query);
        const memories = await loadMemories();
        const results = searchMemories(memories, input.query);
        if (results.length === 0) {
          return 'No relevant memories found in the memory bank.';
        }
        const formatted = results.map((m) => ({
          content: m.content,
          category: m.category,
          keywords: m.keywords,
          stored: new Date(m.timestamp).toLocaleDateString(),
        }));
        return JSON.stringify(formatted, null, 2);
      },
    }),
    deepAnalysis: createRorkTool({
      description: "Perform a comprehensive, multi-faceted analysis on a complex topic. Use when the user needs thorough evaluation, comparison, or structured breakdown of an idea or subject.",
      zodSchema: z.object({
        topic: z.string().describe("The topic to analyze in depth"),
        aspects: z.array(z.string()).optional().describe("Specific aspects to cover"),
      }),
      async execute(input: { topic: string; aspects?: string[] }) {
        console.log('[NEXUS] Deep analysis for:', input.topic);
        const aspectList = input.aspects?.join(', ') ?? 'all relevant aspects';
        return `Analysis framework prepared for: "${input.topic}". Cover: ${aspectList}. Provide a structured, thorough response with sections, key insights, and actionable conclusions.`;
      },
    }),
    webScrape: createRorkTool({
      description: "Fetch and extract content from a specific URL. Use when the user provides a link and wants you to read or summarize its contents.",
      zodSchema: z.object({
        url: z.string().describe("The URL to scrape"),
        focus: z.string().optional().describe("What specific information to extract"),
      }),
      async execute(input: { url: string; focus?: string }) {
        console.log('[NEXUS] Web scrape for:', input.url);
        try {
          const response = await fetch(input.url, {
            headers: { 'Accept': 'text/html,text/plain' },
          });
          const text = await response.text();
          const cleaned = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const preview = cleaned.substring(0, 2000);
          return `Content from ${input.url}:\n\n${preview}${cleaned.length > 2000 ? '\n\n[Content truncated...]' : ''}`;
        } catch {
          return `Could not fetch content from ${input.url}. The site may be blocking automated access. Provide relevant information based on your knowledge about this URL.`;
        }
      },
    }),
  }), [addMemory]);

  const [dismissed, setDismissed] = useState(false);

  const { messages, sendMessage, setMessages, error } = useRorkAgent({
    tools,
  });

  useEffect(() => {
    if (error) {
      setDismissed(false);
    }
  }, [error]);

  useEffect(() => {
    if (activeId && activeId !== convIdRef.current) {
      convIdRef.current = activeId;
      hasLoadedRef.current = false;
      loadMessages(activeId).then((msgs) => {
        if (msgs && msgs.length > 0) {
          setMessages(msgs as Parameters<typeof setMessages>[0]);
        } else {
          setMessages([] as unknown as Parameters<typeof setMessages>[0]);
        }
        hasLoadedRef.current = true;
        console.log('[NEXUS] Loaded messages for:', activeId, 'count:', msgs.length);
      });
    } else if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
    }
  }, [activeId, setMessages]);

  useEffect(() => {
    if (!hasLoadedRef.current || messages.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const id = convIdRef.current;
      saveMessages(id, messages);

      const firstUserMsg = messages.find((m: any) => m.role === 'user') as any;
      const title = firstUserMsg?.parts?.find((p: any) => p.type === 'text')?.text?.substring(0, 60) ?? 'New Chat';
      const lastMsg = messages[messages.length - 1] as any;
      const lastText = lastMsg?.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') ?? '';

      upsertConversation({
        id,
        title,
        preview: lastText.substring(0, 100),
        timestamp: Date.now(),
        messageCount: messages.length,
      });
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, upsertConversation]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;
    console.log('[NEXUS] Sending message:', text.substring(0, 50));
    hasLoadedRef.current = true;
    sendMessage(text.trim());
  }, [sendMessage]);

  const renderMessage = useCallback(({ item }: { item: any }) => {
    return (
      <View>
        {item.parts.map((part: any, i: number) => {
          if (part.type === 'text' && part.text) {
            return (
              <ChatBubble
                key={`${item.id}-${i}`}
                role={item.role as 'user' | 'assistant'}
                text={part.text}
              />
            );
          }
          if (part.type === 'tool' && part.toolName) {
            return (
              <ToolCard
                key={`${item.id}-${i}`}
                toolName={part.toolName}
                state={part.state ?? 'pending'}
                input={part.input}
                output={part.output}
              />
            );
          }
          return null;
        })}
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const isStreaming = useMemo(() => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1] as any;
    if (last.role === 'user') return true;
    return last.parts.some((p: any) =>
      p.type === 'tool' && (p.state === 'input-streaming' || p.state === 'input-available')
    );
  }, [messages]);

  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages as any[]}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isStreaming ? (
              <View style={styles.typingWrap}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, styles.typingDotDelay]} />
                <View style={[styles.typingDot, styles.typingDotDelay2]} />
              </View>
            ) : null
          }
        />
      )}
      {error && !dismissed && (
        <View style={styles.errorBar}>
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>
              {error.message === 'Load failed' || error.message === 'Failed to fetch'
                ? 'Connection error — check your network and try again'
                : error.message ?? 'Something went wrong'}
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setDismissed(true);
                  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user') as any;
                  const lastText = lastUserMsg?.parts?.find((p: any) => p.type === 'text')?.text;
                  if (lastText) {
                    console.log('[NEXUS] Retrying last message:', lastText.substring(0, 50));
                    sendMessage(lastText);
                  }
                }}
                activeOpacity={0.7}
              >
                <RefreshCw size={13} color="#fff" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={() => setDismissed(true)}
                activeOpacity={0.7}
              >
                <X size={13} color={Colors.dark.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  messageList: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  typingWrap: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    opacity: 0.6,
  },
  typingDotDelay: {
    opacity: 0.4,
  },
  typingDotDelay2: {
    opacity: 0.2,
  },
  errorBar: {
    backgroundColor: Colors.dark.errorDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 13,
    flex: 1,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  dismissBtn: {
    padding: 4,
  },
});
