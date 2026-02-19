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
import {
  loadMemories,
  searchMemories,
  generateId,
  reinforceMemory,
  saveMemories,
  deduplicateMemories,
} from '@/utils/memory';
import { extractMemoryCandidates, getEnhancedSystemPrompt } from '@/utils/context';
import { analyzeEmotion, assessMetacognition, buildThoughtTree, detectCuriosity, buildEmotionalMimicry } from '@/utils/cognition';
import { MemoryEntry, MemoryCategory } from '@/types';

export default function ChatScreen() {
  const { activeId, setActiveId, upsertConversation, addMemory, startNewChat } = useConversations();
  const convIdRef = useRef<string>(activeId ?? generateId());
  const hasLoadedRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractionRef = useRef(false);

  useEffect(() => {
    if (!activeId) {
      const newId = generateId();
      convIdRef.current = newId;
      setActiveId(newId);
    }
  }, [activeId, setActiveId]);

  const tools = useMemo(() => ({
    webSearch: createRorkTool({
      description: "Search the internet for current information. Use for news, facts, real-time data, or anything beyond your training cutoff. Always prefer this over guessing.",
      zodSchema: z.object({
        query: z.string().describe("Search query — be specific and include date context if relevant"),
      }),
      async execute(input: { query: string }) {
        console.log('[NEXUS] Web search:', input.query);
        try {
          const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`
          );
          const data = await response.json();
          const results: string[] = [];
          if (data.Abstract) results.push(`Summary: ${data.Abstract}`);
          if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 5)) {
              if (topic.Text) results.push(`- ${topic.Text}`);
            }
          }
          if (results.length > 0) {
            return `Search results for "${input.query}":\n\n${results.join('\n')}`;
          }
          return `Search completed for: "${input.query}". No structured results from DuckDuckGo API. Provide a comprehensive answer based on your knowledge, noting any limitations.`;
        } catch {
          return `Search for "${input.query}" encountered a network issue. Answer from your knowledge and note the limitation.`;
        }
      },
    }),

    storeMemory: createRorkTool({
      description: "Store information in the user's persistent semantic memory bank. Use when: user says 'remember this', shares personal preferences, states goals, gives instructions for future behavior, or shares important facts.",
      zodSchema: z.object({
        content: z.string().describe("The information to store — be precise and self-contained"),
        keywords: z.array(z.string()).describe("3-6 relevant keywords for future retrieval"),
        category: z.enum(['preference', 'fact', 'instruction', 'context', 'goal', 'persona', 'skill', 'entity', 'episodic']).describe("Memory category"),
        importance: z.number().min(1).max(5).describe("1=trivial, 2=low, 3=moderate, 4=high, 5=critical"),
        relations: z.array(z.string()).optional().describe("IDs of related memories if known"),
      }),
      async execute(input: { content: string; keywords: string[]; category: string; importance: number; relations?: string[] }) {
        console.log('[NEXUS] Storing memory:', input.content.substring(0, 60));
        const entry: MemoryEntry = {
          id: generateId(),
          content: input.content,
          keywords: input.keywords,
          category: input.category as MemoryCategory,
          timestamp: Date.now(),
          importance: input.importance,
          source: 'conversation',
          accessCount: 0,
          lastAccessed: Date.now(),
          relations: input.relations ?? [],
          consolidated: false,
          decay: 1.0,
        };
        addMemory(entry);
        return `Memory stored [${input.category}/${input.importance}★]: "${input.content.substring(0, 80)}..." | Tags: ${input.keywords.join(', ')}`;
      },
    }),

    recallMemory: createRorkTool({
      description: "Search the user's semantic memory bank. Use BEFORE answering questions about user preferences, past conversations, stored facts, or anything the user previously asked you to remember.",
      zodSchema: z.object({
        query: z.string().describe("Natural language search query"),
        category: z.enum(['preference', 'fact', 'instruction', 'context', 'goal', 'persona', 'skill', 'entity', 'episodic', 'all']).optional().describe("Filter by category, or 'all'"),
        maxResults: z.number().min(1).max(15).optional().describe("Max results to return"),
      }),
      async execute(input: { query: string; category?: string; maxResults?: number }) {
        console.log('[NEXUS] Recalling memory:', input.query);
        const memories = await loadMemories();
        const categoryFilter = input.category && input.category !== 'all'
          ? [input.category as MemoryCategory]
          : undefined;
        const results = searchMemories(memories, input.query, {
          maxResults: input.maxResults ?? 8,
          categoryFilter,
        });

        if (results.length === 0) {
          return 'No relevant memories found. The memory bank has ' + memories.length + ' total entries.';
        }

        const reinforced = results.map((r) => reinforceMemory(r.memory));
        const allMemories = await loadMemories();
        for (const rm of reinforced) {
          const idx = allMemories.findIndex((m) => m.id === rm.id);
          if (idx >= 0) allMemories[idx] = rm;
        }
        await saveMemories(allMemories);

        const formatted = results.map((r) => ({
          content: r.memory.content,
          category: r.memory.category,
          keywords: r.memory.keywords,
          importance: r.memory.importance,
          relevanceScore: parseFloat(r.score.toFixed(3)),
          matchType: r.matchType,
          stored: new Date(r.memory.timestamp).toLocaleDateString(),
          accessCount: r.memory.accessCount,
        }));
        return JSON.stringify(formatted, null, 2);
      },
    }),

    deepAnalysis: createRorkTool({
      description: "Perform structured multi-dimensional analysis. Use for complex topics requiring systematic evaluation, comparison matrices, SWOT analysis, pros/cons, or decision frameworks.",
      zodSchema: z.object({
        topic: z.string().describe("The subject to analyze"),
        framework: z.enum(['swot', 'pros_cons', 'comparison', 'root_cause', 'decision_matrix', 'general']).optional().describe("Analysis framework"),
        aspects: z.array(z.string()).optional().describe("Specific dimensions to evaluate"),
        depth: z.enum(['quick', 'standard', 'comprehensive']).optional().describe("Analysis depth"),
      }),
      async execute(input: { topic: string; framework?: string; aspects?: string[]; depth?: string }) {
        console.log('[NEXUS] Deep analysis:', input.topic);
        const fw = input.framework ?? 'general';
        const depth = input.depth ?? 'standard';
        const aspects = input.aspects?.join(', ') ?? 'all relevant dimensions';
        return `Analysis framework: ${fw.toUpperCase()} | Depth: ${depth} | Topic: "${input.topic}" | Aspects: ${aspects}. Provide a structured, thorough analysis with clear sections, evidence-based reasoning, and actionable conclusions. Use tables or matrices where appropriate.`;
      },
    }),

    webScrape: createRorkTool({
      description: "Fetch and extract content from a URL. Use when the user shares a link or when you need to read a specific webpage.",
      zodSchema: z.object({
        url: z.string().describe("Full URL to fetch"),
        extractType: z.enum(['full', 'summary', 'links', 'headings', 'metadata']).optional().describe("What to extract"),
      }),
      async execute(input: { url: string; extractType?: string }) {
        console.log('[NEXUS] Scraping:', input.url);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(input.url, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; NexusBot/1.0)',
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const contentType = response.headers.get('content-type') ?? '';
          const text = await response.text();

          if (contentType.includes('json')) {
            const pretty = JSON.stringify(JSON.parse(text), null, 2).substring(0, 3000);
            return `JSON from ${input.url}:\n\`\`\`json\n${pretty}\n\`\`\``;
          }

          let cleaned = text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (input.extractType === 'headings') {
            const headings = text.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) ?? [];
            const extracted = headings.map((h) => h.replace(/<[^>]*>/g, '').trim());
            return `Headings from ${input.url}:\n${extracted.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;
          }

          if (input.extractType === 'links') {
            const links = text.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) ?? [];
            const extracted = links.slice(0, 20).map((l) => {
              const href = l.match(/href="([^"]+)"/)?.[1] ?? '';
              const label = l.replace(/<[^>]*>/g, '').trim();
              return `- [${label}](${href})`;
            });
            return `Links from ${input.url}:\n${extracted.join('\n')}`;
          }

          const preview = cleaned.substring(0, 3000);
          return `Content from ${input.url} (${cleaned.length} chars):\n\n${preview}${cleaned.length > 3000 ? '\n\n[Truncated...]' : ''}`;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          return `Failed to fetch ${input.url}: ${message}. The site may block automated access.`;
        }
      },
    }),

    generateImage: createRorkTool({
      description: "Generate an image using DALL-E 3. Use for creative requests, visualizations, concept art, diagrams, or when the user asks you to create/draw/generate an image.",
      zodSchema: z.object({
        prompt: z.string().describe("Detailed image generation prompt — include style, composition, colors, mood"),
        size: z.enum(['1024x1024', '1024x1792', '1792x1024']).optional().describe("Image dimensions"),
      }),
      async execute(input: { prompt: string; size?: string }) {
        console.log('[NEXUS] Generating image:', input.prompt.substring(0, 60));
        try {
          const response = await fetch('https://toolkit.rork.com/images/generate/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: input.prompt, size: input.size ?? '1024x1024' }),
          });
          const data = await response.json();
          if (data.image?.base64Data) {
            return `Image generated successfully. [Generated image based on: "${input.prompt.substring(0, 100)}"]`;
          }
          return 'Image generation completed but no image data was returned.';
        } catch {
          return 'Image generation failed due to a network error. Please try again.';
        }
      },
    }),

    calculator: createRorkTool({
      description: "Evaluate mathematical expressions with precision. Use for any calculations, unit conversions, percentages, or numeric operations instead of mental math.",
      zodSchema: z.object({
        expression: z.string().describe("Mathematical expression (e.g., '(45.5 * 1.08) + 200', 'Math.sqrt(144)', '15% of 2400')"),
        description: z.string().optional().describe("What this calculation represents"),
      }),
      async execute(input: { expression: string; description?: string }) {
        console.log('[NEXUS] Calculating:', input.expression);
        try {
          let expr = input.expression
            .replace(/(\d+)%\s*of\s*(\d+(?:\.\d+)?)/gi, '($1/100)*$2')
            .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');

          const safeExpr = expr.replace(/[^0-9+\-*/().%,\s]|Math\.\w+/g, (match) => {
            if (match.startsWith('Math.')) return match;
            return '';
          });

          const fn = new Function('Math', `return (${safeExpr})`);
          const result = fn(Math);

          if (typeof result !== 'number' || !isFinite(result)) {
            return `Could not evaluate: "${input.expression}". Result was ${result}.`;
          }

          const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');
          const label = input.description ? ` (${input.description})` : '';
          return `${input.expression} = ${formatted}${label}`;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          return `Calculation error for "${input.expression}": ${message}`;
        }
      },
    }),

    taskPlanner: createRorkTool({
      description: "Break down complex tasks into structured, actionable steps. Use when facing multi-step problems, project planning, or when the user asks 'how do I...' for complex goals.",
      zodSchema: z.object({
        task: z.string().describe("The complex task or goal to plan"),
        constraints: z.array(z.string()).optional().describe("Known constraints or requirements"),
        timeframe: z.string().optional().describe("Desired completion timeframe"),
      }),
      async execute(input: { task: string; constraints?: string[]; timeframe?: string }) {
        console.log('[NEXUS] Planning task:', input.task.substring(0, 60));
        const constraintStr = input.constraints?.length
          ? `\nConstraints: ${input.constraints.join('; ')}`
          : '';
        const timeStr = input.timeframe ? `\nTimeframe: ${input.timeframe}` : '';
        return `Task decomposition for: "${input.task}"${constraintStr}${timeStr}\n\nProvide a structured plan with:\n1. Prerequisites and preparation\n2. Ordered action steps with time estimates\n3. Dependencies between steps\n4. Risk factors and mitigations\n5. Success criteria and milestones`;
      },
    }),

    summarize: createRorkTool({
      description: "Create a concise summary of long text, articles, or conversation history. Use when the user asks to summarize content or when context is getting too long.",
      zodSchema: z.object({
        content: z.string().describe("The text content to summarize"),
        style: z.enum(['brief', 'detailed', 'bullets', 'executive']).optional().describe("Summary format"),
        maxLength: z.number().optional().describe("Target word count"),
      }),
      async execute(input: { content: string; style?: string; maxLength?: number }) {
        console.log('[NEXUS] Summarizing content, length:', input.content.length);
        const style = input.style ?? 'brief';
        const maxLen = input.maxLength ?? 150;
        return `Summarize the following in ${style} style (target ~${maxLen} words):\n\n${input.content.substring(0, 4000)}`;
      },
    }),

    cognitiveAnalysis: createRorkTool({
      description: "Engage the Tree of Thought reasoning engine for complex, multi-faceted problems. Use when the query requires structured decomposition, exploring multiple solution paths, weighing trade-offs, or deep systematic analysis. Ideal for 'how should I approach...', design decisions, strategic planning, and nuanced questions.",
      zodSchema: z.object({
        problem: z.string().describe("The complex problem or question to reason through"),
        constraints: z.array(z.string()).optional().describe("Known constraints or boundary conditions"),
        preferredApproach: z.enum(['analytical', 'creative', 'balanced', 'adversarial']).optional().describe("Reasoning style"),
      }),
      async execute(input: { problem: string; constraints?: string[]; preferredApproach?: string }) {
        console.log('[NEXUS] Cognitive analysis:', input.problem.substring(0, 60));
        const memories = await loadMemories();
        const relevant = searchMemories(memories, input.problem, { maxResults: 5 });
        const meta = assessMetacognition(input.problem, 0);
        const tree = buildThoughtTree(input.problem, relevant, meta);

        const approach = input.preferredApproach ?? 'balanced';
        const constraintStr = input.constraints?.length ? `\nConstraints: ${input.constraints.join('; ')}` : '';

        const branchSummaries = tree.branches
          .filter(b => !b.pruned)
          .slice(0, 4)
          .map(b => {
            let s = `[${(b.confidence * 100).toFixed(0)}%] ${b.hypothesis}`;
            if (b.evidence.length > 0) s += ` — Evidence: ${b.evidence.slice(0, 2).join('; ')}`;
            if (b.counterpoints.length > 0) s += ` — Caution: ${b.counterpoints[0]}`;
            if (b.children.length > 0) s += ` — Sub-paths: ${b.children.map(c => c.hypothesis).join(', ')}`;
            return s;
          })
          .join('\n');

        return `## Tree of Thought Analysis\nProblem: "${input.problem}"${constraintStr}\nApproach: ${approach} | Complexity: ${meta.reasoningComplexity} | Convergence: ${(tree.convergenceScore * 100).toFixed(0)}%\n\nReasoning Branches:\n${branchSummaries}\n\nProvide a comprehensive response that:\n1. Explores the highest-confidence paths\n2. Addresses counterpoints honestly\n3. Synthesizes into a clear recommendation\n4. Notes remaining uncertainties`;
      },
    }),

    emotionalPulse: createRorkTool({
      description: "Analyze the emotional undertone of the conversation and adapt response strategy. Use when you sense the user is frustrated, excited, confused, anxious, or when emotional attunement would improve the interaction. Also use proactively when tone shifts.",
      zodSchema: z.object({
        context: z.string().describe("The user message or conversation context to analyze"),
        respondWith: z.enum(['empathy', 'encouragement', 'calm', 'enthusiasm', 'directness']).optional().describe("Desired response tone"),
      }),
      async execute(input: { context: string; respondWith?: string }) {
        console.log('[NEXUS] Emotional pulse check:', input.context.substring(0, 60));
        const emotion = analyzeEmotion(input.context);
        const mimicry = buildEmotionalMimicry(emotion);
        const curiosity = detectCuriosity(input.context, await loadMemories(), emotion);

        const curiosityHints = curiosity.length > 0
          ? `\nKnowledge gaps detected: ${curiosity.map(c => `"${c.topic}" (gap: ${(c.knowledgeGap * 100).toFixed(0)}%)`).join(', ')}`
          : '';

        return `## Emotional Intelligence Report\nValence: ${emotion.valence} | Arousal: ${emotion.arousal} | Dominant: ${emotion.dominantEmotion}\nCommunication Style: ${emotion.style} | Empathy Level: ${(emotion.empathyLevel * 100).toFixed(0)}%\nConfidence: ${(emotion.confidence * 100).toFixed(0)}%${curiosityHints}\n\nAdaptive Tone Guidance:\n${mimicry}\n\n${input.respondWith ? `User-requested tone: ${input.respondWith}. Blend this with the detected emotional needs.` : 'Adapt naturally to the detected emotional state.'}`;
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
    if (!extractionRef.current && messages.length >= 4) {
      const last = messages[messages.length - 1] as any;
      const secondLast = messages.length >= 2 ? messages[messages.length - 2] as any : null;

      if (last?.role === 'assistant' && secondLast?.role === 'user') {
        const userText = secondLast.parts?.find((p: any) => p.type === 'text')?.text ?? '';
        const assistantText = last.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') ?? '';

        if (userText.length > 20 && assistantText.length > 20) {
          extractionRef.current = true;
          extractMemoryCandidates(userText, assistantText).then((candidates) => {
            for (const c of candidates) {
              const entry: MemoryEntry = {
                id: generateId(),
                content: c.content,
                keywords: c.keywords,
                category: c.category as MemoryCategory,
                timestamp: Date.now(),
                importance: c.importance,
                source: 'auto-extract',
                accessCount: 0,
                lastAccessed: Date.now(),
                relations: [],
                consolidated: false,
                decay: 1.0,
              };
              addMemory(entry);
              console.log('[NEXUS] Auto-stored memory:', c.content.substring(0, 50));
            }
            extractionRef.current = false;
          }).catch(() => {
            extractionRef.current = false;
          });
        }
      }
    }
  }, [messages, addMemory]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;
    console.log('[NEXUS] Sending message:', text.substring(0, 50));
    hasLoadedRef.current = true;

    const memories = await loadMemories();
    const systemPrompt = await getEnhancedSystemPrompt(memories, text, messages);

    sendMessage({
      text: text.trim(),
      systemPrompt,
    } as any);
  }, [sendMessage, messages]);

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
                    console.log('[NEXUS] Retrying:', lastText.substring(0, 50));
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
    gap: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
    opacity: 0.7,
  },
  typingDotDelay: {
    opacity: 0.45,
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
