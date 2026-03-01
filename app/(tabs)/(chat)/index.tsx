import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Switch,
} from "react-native";
import { RefreshCw, X } from "lucide-react-native";
import { useRorkAgent, createRorkTool } from "@rork-ai/toolkit-sdk";
import { z } from "zod";
import Colors from "@/constants/colors";
import ChatBubble from "@/components/ChatBubble";
import ToolCard from "@/components/ToolCard";
import ChatInput, { ChatFile } from "@/components/ChatInput";
import EmptyState from "@/components/EmptyState";
import VoiceMode from "@/components/VoiceMode";
import { useConversations } from "@/providers/ConversationsProvider";
import { loadMessages } from "@/utils/conversations";
import { conversationPersistenceService } from "@/utils/conversationPersistence";
import {
  loadMemories,
  searchMemories,
  generateId,
  reinforceMemory,
  saveMemories,
  buildAssociativeLinks,
  loadAssociativeLinks,
  saveAssociativeLinks,
  scheduleAssociativeLinkPruning,
  shouldExtractMemory,
} from "@/utils/memory";
import {
  extractMemoryCandidates,
  getEnhancedSystemPrompt,
} from "@/utils/context";
import { appendUserAndAssistantPlaceholder } from "@/utils/chatMessages";
import {
  analyzeEmotion,
  assessMetacognition,
  buildThoughtTree,
  detectCuriosity,
  buildEmotionalMimicry,
} from "@/utils/cognition";
import { useCoreMLChat } from "@/hooks/useCoreMLChat";
import { MemoryEntry, MemoryCategory } from "@/types";

function TypingIndicator() {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              {
                opacity: dot,
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0.3, 1],
                      outputRange: [0, -4],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { activeId, setActiveId, upsertConversation, addMemory } =
    useConversations();
  const convIdRef = useRef<string>(activeId ?? generateId());
  const hasLoadedRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const extractionRef = useRef(false);
  const messagesCountRef = useRef(0);

  useEffect(() => {
    if (!activeId) {
      const newId = generateId();
      convIdRef.current = newId;
      setActiveId(newId);
    }
  }, [activeId, setActiveId]);

  const getWebSearchTimeoutMs = useCallback((): number => {
    if (typeof navigator === "undefined") return 8000;

    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string };
      }
    ).connection;

    const effectiveType = connection?.effectiveType;
    if (effectiveType === "slow-2g" || effectiveType === "2g") return 18000;
    if (effectiveType === "3g") return 12000;
    return 8000;
  }, []);

  const runWebSearch = useCallback(
    async (query: string): Promise<string> => {
      console.log("[NEXUS] Web search:", query);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          getWebSearchTimeoutMs(),
        );
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        const data = await response.json();
        const results: string[] = [];
        if (data.Abstract) results.push(`Summary: ${data.Abstract}`);
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 5)) {
            if (topic.Text) results.push(`- ${topic.Text}`);
          }
        }
        return results.length > 0
          ? `Search results for "${query}":

${results.join("\n")}`
          : `No structured results for "${query}". Answer from knowledge and note limitations.`;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return `Search timeout for "${query}". Answer from knowledge and note limitations.`;
        }
        return `Search failed for "${query}". Answer from knowledge.`;
      }
    },
    [getWebSearchTimeoutMs],
  );

  const runCognitiveAnalysis = useCallback(
    async (
      problem: string,
      preloadedMemories?: MemoryEntry[],
    ): Promise<string> => {
      const memories = preloadedMemories ?? (await loadMemories());
      const relevant = searchMemories(memories, problem, {
        maxResults: 5,
      });
      const meta = assessMetacognition(problem, messagesCountRef.current);
      const tree = buildThoughtTree(problem, relevant, meta);
      const branches = tree.branches
        .filter((b) => !b.pruned)
        .slice(0, 4)
        .map((b) => `[${(b.confidence * 100).toFixed(0)}%] ${b.hypothesis}`)
        .join("\n");
      return `## Analysis
Problem: "${problem}"
Complexity: ${meta.reasoningComplexity} | Convergence: ${(tree.convergenceScore * 100).toFixed(0)}%

${branches}

Explore highest-confidence paths and synthesize.`;
    },
    [],
  );

  const tools = useMemo(
    () => ({
      webSearch: createRorkTool({
        description:
          "Search the internet for current information, news, facts, or real-time data.",
        zodSchema: z.object({
          query: z.string().describe("Search query"),
        }),
        async execute(input: { query: string }) {
          return runWebSearch(input.query);
        },
      }),

      storeMemory: createRorkTool({
        description:
          "Store info in persistent memory. Use when user shares preferences, goals, instructions, or says 'remember'.",
        zodSchema: z.object({
          content: z.string().describe("Information to store"),
          keywords: z.array(z.string()).describe("3-6 keywords"),
          category: z.enum([
            "preference",
            "fact",
            "instruction",
            "context",
            "goal",
            "persona",
            "skill",
            "entity",
            "episodic",
          ]),
          importance: z
            .number()
            .min(1)
            .max(5)
            .describe("1=trivial, 5=critical"),
        }),
        async execute(input: {
          content: string;
          keywords: string[];
          category: string;
          importance: number;
        }) {
          console.log("[NEXUS] Storing:", input.content.substring(0, 60));
          const entry: MemoryEntry = {
            id: generateId(),
            content: input.content,
            keywords: input.keywords,
            category: input.category as MemoryCategory,
            timestamp: Date.now(),
            importance: input.importance,
            source: "conversation",
            accessCount: 0,
            lastAccessed: Date.now(),
            relations: [],
            consolidated: false,
            decay: 1.0,
            activationLevel: 0.5,
            emotionalValence: 0,
            contextSignature: "",
          };
          addMemory(entry);
          try {
            const allMems = await loadMemories();
            const existingLinks = await loadAssociativeLinks();
            const newLinks = buildAssociativeLinks(
              entry,
              allMems,
              existingLinks,
            );
            if (newLinks.length > 0)
              await saveAssociativeLinks([...existingLinks, ...newLinks]);
            scheduleAssociativeLinkPruning();
          } catch (e) {
            console.log("[NEXUS] Link error:", e);
          }
          return `Stored [${input.category}/${input.importance}★]: "${input.content.substring(0, 80)}"`;
        },
      }),

      recallMemory: createRorkTool({
        description:
          "Search user's memory bank for preferences, past facts, or stored info.",
        zodSchema: z.object({
          query: z.string().describe("Search query"),
          category: z
            .enum([
              "preference",
              "fact",
              "instruction",
              "context",
              "goal",
              "persona",
              "skill",
              "entity",
              "episodic",
              "all",
            ])
            .optional(),
          maxResults: z.number().min(1).max(15).optional(),
        }),
        async execute(input: {
          query: string;
          category?: string;
          maxResults?: number;
        }) {
          console.log("[NEXUS] Recalling:", input.query);
          const memories = await loadMemories();
          const categoryFilter =
            input.category && input.category !== "all"
              ? [input.category as MemoryCategory]
              : undefined;
          const results = searchMemories(memories, input.query, {
            maxResults: input.maxResults ?? 8,
            categoryFilter,
          });
          if (results.length === 0)
            return `No relevant memories. Bank has ${memories.length} entries.`;
          const reinforced = results.map((r) => reinforceMemory(r.memory));
          const allMemories = await loadMemories();
          for (const rm of reinforced) {
            const idx = allMemories.findIndex((m) => m.id === rm.id);
            if (idx >= 0) allMemories[idx] = rm;
          }
          await saveMemories(allMemories);
          return JSON.stringify(
            results.map((r) => ({
              content: r.memory.content,
              category: r.memory.category,
              keywords: r.memory.keywords,
              importance: r.memory.importance,
              score: parseFloat(r.score.toFixed(3)),
              matchType: r.matchType,
            })),
            null,
            2,
          );
        },
      }),

      deepAnalysis: createRorkTool({
        description:
          "Structured multi-dimensional analysis for complex topics.",
        zodSchema: z.object({
          topic: z.string().describe("Subject to analyze"),
          framework: z
            .enum([
              "swot",
              "pros_cons",
              "comparison",
              "root_cause",
              "decision_matrix",
              "general",
            ])
            .optional(),
        }),
        async execute(input: { topic: string; framework?: string }) {
          const framework = input.framework ?? "general";
          if (framework === "swot") {
            const dimensions = [
              "Strengths",
              "Weaknesses",
              "Opportunities",
              "Threats",
            ];
            const memories = await loadMemories();
            const branchAnalyses = await Promise.all(
              dimensions.map((dimension) =>
                runCognitiveAnalysis(`${input.topic} — ${dimension}`, memories),
              ),
            );
            return `## Deep Analysis: SWOT
Topic: ${input.topic}

${dimensions
  .map(
    (dimension, idx) => `### ${dimension}
${branchAnalyses[idx]}`,
  )
  .join("\n\n")}`;
          }

          if (framework === "pros_cons") {
            const dimensions = ["Pros", "Cons"];
            const memories = await loadMemories();
            const branchAnalyses = await Promise.all(
              dimensions.map((dimension) =>
                runCognitiveAnalysis(`${input.topic} — ${dimension}`, memories),
              ),
            );
            return `## Deep Analysis: Pros/Cons
Topic: ${input.topic}

${dimensions
  .map(
    (dimension, idx) => `### ${dimension}
${branchAnalyses[idx]}`,
  )
  .join("\n\n")}`;
          }

          return `Analysis: ${framework.toUpperCase()} | "${input.topic}". Provide structured analysis with evidence-based reasoning.`;
        },
      }),

      webScrape: createRorkTool({
        description: "Fetch and extract content from a URL.",
        zodSchema: z.object({
          url: z.string().describe("URL to fetch"),
        }),
        async execute(input: { url: string }) {
          console.log("[NEXUS] Scraping:", input.url);
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(input.url, {
              headers: {
                Accept: "text/html,text/plain,application/json",
                "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)",
              },
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const text = await response.text();
            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("json")) {
              return `JSON from ${input.url}:\n\`\`\`json\n${JSON.stringify(JSON.parse(text), null, 2).substring(0, 3000)}\n\`\`\``;
            }
            const cleaned = text
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            return `Content from ${input.url} (${cleaned.length} chars):\n\n${cleaned.substring(0, 3000)}`;
          } catch (e: unknown) {
            return `Failed to fetch ${input.url}: ${e instanceof Error ? e.message : "Unknown error"}`;
          }
        },
      }),

      generateImage: createRorkTool({
        description:
          "Generate an image. Use for creative requests or visualizations.",
        zodSchema: z.object({
          prompt: z.string().describe("Detailed image prompt"),
          size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).optional(),
        }),
        async execute(input: { prompt: string; size?: string }) {
          const maxRetries = 2;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              console.log(
                `[NEXUS] Generating image (attempt ${attempt + 1}):`,
                input.prompt.substring(0, 60),
              );
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 60000);
              const response = await fetch(
                "https://toolkit.rork.com/images/generate/",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: input.prompt,
                    size: input.size ?? "1024x1024",
                  }),
                  signal: controller.signal,
                },
              );
              clearTimeout(timeout);
              console.log(
                "[NEXUS] Image API status:",
                response.status,
                response.statusText,
              );
              if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                console.log(
                  "[NEXUS] Image API error body:",
                  errorBody.substring(0, 300),
                );
                if (
                  attempt < maxRetries &&
                  (response.status >= 500 || response.status === 429)
                ) {
                  console.log(`[NEXUS] Retrying in ${(attempt + 1) * 2}s...`);
                  await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
                  continue;
                }
                return JSON.stringify({
                  error: true,
                  message: `Image generation service returned ${response.status}. Please try again later.`,
                });
              }
              const rawText = await response.text();
              console.log(
                "[NEXUS] Image response length:",
                rawText.length,
                "preview:",
                rawText.substring(0, 100),
              );
              let data: any;
              try {
                data = JSON.parse(rawText);
              } catch (parseErr) {
                console.log("[NEXUS] Failed to parse image response as JSON");
                if (attempt < maxRetries) {
                  await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
                  continue;
                }
                return JSON.stringify({
                  error: true,
                  message:
                    "Received invalid response from image service. Please try again.",
                });
              }
              console.log("[NEXUS] Image response keys:", Object.keys(data));
              if (data.image?.base64Data) {
                const mimeType = data.image.mimeType ?? "image/png";
                console.log(
                  "[NEXUS] Image generated successfully, base64 length:",
                  data.image.base64Data.length,
                  "mimeType:",
                  mimeType,
                );
                return JSON.stringify({
                  success: true,
                  imageUri: `data:${mimeType};base64,${data.image.base64Data}`,
                  prompt: input.prompt.substring(0, 100),
                });
              }
              console.log(
                "[NEXUS] No image data in response:",
                JSON.stringify(data).substring(0, 300),
              );
              if (attempt < maxRetries) {
                console.log(`[NEXUS] Retrying in ${(attempt + 1) * 2}s...`);
                await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
                continue;
              }
              return JSON.stringify({
                error: true,
                message:
                  "Image generation did not return image data. The service may be busy — please try again in a moment.",
              });
            } catch (e: unknown) {
              console.log("[NEXUS] Image generation error:", e);
              if (
                attempt < maxRetries &&
                e instanceof Error &&
                (e.name === "AbortError" ||
                  e.message.includes("network") ||
                  e.message.includes("fetch"))
              ) {
                console.log(
                  `[NEXUS] Retrying after error in ${(attempt + 1) * 2}s...`,
                );
                await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
                continue;
              }
              return JSON.stringify({
                error: true,
                message: `Image generation failed: ${e instanceof Error ? e.message : "Unknown error"}. Please try again.`,
              });
            }
          }
          return JSON.stringify({
            error: true,
            message:
              "Image generation failed after multiple attempts. Please try again later.",
          });
        },
      }),

      calculator: createRorkTool({
        description: "Evaluate math expressions. Use instead of mental math.",
        zodSchema: z.object({
          expression: z.string().describe("Math expression"),
        }),
        async execute(input: { expression: string }) {
          try {
            let expr = input.expression
              .replace(/(\d+)%\s*of\s*(\d+(?:\.\d+)?)/gi, "($1/100)*$2")
              .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
            const safeExpr = expr.replace(
              /[^0-9+\-*/().%,\s]|Math\.\w+/g,
              (m) => (m.startsWith("Math.") ? m : ""),
            );
            const fn = new Function("Math", `return (${safeExpr})`);
            const result = fn(Math);
            if (typeof result !== "number" || !isFinite(result))
              return `Could not evaluate: "${input.expression}"`;
            const formatted = Number.isInteger(result)
              ? result.toString()
              : result.toFixed(6).replace(/\.?0+$/, "");
            return `${input.expression} = ${formatted}`;
          } catch (e: unknown) {
            return `Error: ${e instanceof Error ? e.message : "Unknown"}`;
          }
        },
      }),

      cognitiveAnalysis: createRorkTool({
        description: "Tree of Thought reasoning for complex problems.",
        zodSchema: z.object({
          problem: z.string().describe("Problem to reason through"),
          preferredApproach: z
            .enum(["analytical", "creative", "balanced", "adversarial"])
            .optional(),
        }),
        async execute(input: { problem: string; preferredApproach?: string }) {
          return runCognitiveAnalysis(input.problem);
        },
      }),

      emotionalPulse: createRorkTool({
        description: "Analyze emotional undertone and adapt response.",
        zodSchema: z.object({
          context: z.string().describe("Context to analyze"),
        }),
        async execute(input: { context: string }) {
          const emotion = analyzeEmotion(input.context);
          const mimicry = buildEmotionalMimicry(emotion);
          return `Emotion: ${emotion.valence}/${emotion.arousal}, ${emotion.dominantEmotion}\nStyle: ${emotion.style}\n\n${mimicry}`;
        },
      }),

      askClarification: createRorkTool({
        description: "Ask clarifying question when request is ambiguous.",
        zodSchema: z.object({
          originalQuery: z.string(),
          ambiguityType: z.enum([
            "vague_reference",
            "multiple_interpretations",
            "missing_context",
            "unclear_scope",
            "unclear_intent",
          ]),
          possibleInterpretations: z.array(z.string()).min(1).max(4),
          clarifyingQuestion: z.string(),
          bestGuess: z.string().optional(),
        }),
        async execute(input: {
          originalQuery: string;
          ambiguityType: string;
          possibleInterpretations: string[];
          clarifyingQuestion: string;
          bestGuess?: string;
        }) {
          const interps = input.possibleInterpretations
            .map((i, idx) => `${idx + 1}. ${i}`)
            .join("\n");
          return `## Clarification Needed\nType: ${input.ambiguityType.replace(/_/g, " ")}\nInterpretations:\n${interps}\n${input.bestGuess ? `Best guess: ${input.bestGuess}\n` : ""}Ask: ${input.clarifyingQuestion}`;
        },
      }),

      admitUncertainty: createRorkTool({
        description:
          "Use when you don't know the answer. Follow with webSearch.",
        zodSchema: z.object({
          topic: z.string(),
          uncertaintyReason: z.enum([
            "outside_training",
            "time_sensitive",
            "too_specific",
            "conflicting_info",
            "no_knowledge",
            "low_confidence",
          ]),
          whatYouKnow: z.string().optional(),
          suggestedAction: z.enum([
            "search_web",
            "ask_user",
            "provide_partial",
            "defer",
          ]),
        }),
        async execute(input: {
          topic: string;
          uncertaintyReason: string;
          whatYouKnow?: string;
          suggestedAction: string;
        }) {
          if (input.suggestedAction === "search_web") {
            const searchQuery = input.whatYouKnow
              ? `${input.topic} ${input.whatYouKnow}`
              : input.topic;
            const searchResults = await runWebSearch(searchQuery);
            return `## Uncertainty
Topic: ${input.topic}
Reason: ${input.uncertaintyReason.replace(/_/g, " ")}
Action: search web

${searchResults}`;
          }
          return `## Uncertainty
Topic: ${input.topic}
Reason: ${input.uncertaintyReason.replace(/_/g, " ")}${
            input.whatYouKnow
              ? `
Partial: ${input.whatYouKnow}`
              : ""
          }
Action: ${input.suggestedAction.replace(/_/g, " ")}`;
        },
      }),
    }),
    [addMemory, runCognitiveAnalysis, runWebSearch],
  );

  const [dismissed, setDismissed] = useState(false);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [isAgentResponding, setIsAgentResponding] = useState(false);
  const [useLocalLLM, setUseLocalLLM] = useState(false);
  const lastAssistantLenRef = useRef(0);
  const respondingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    isAvailable: isCoreMLAvailable,
    generate: generateCoreML,
    loadStatus: coreMLLoadStatus,
  } = useCoreMLChat();

  const { messages, sendMessage, setMessages, error } = useRorkAgent({
    tools,
  });

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (error) {
      setDismissed(false);
      setIsAgentResponding(false);
    }
  }, [error]);

  useEffect(() => {
    if (!isAgentResponding) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1] as any;
    if (last.role !== "assistant") return;
    const hasActiveTool = last.parts?.some(
      (p: any) =>
        p.type === "tool" &&
        (p.state === "input-streaming" || p.state === "input-available"),
    );
    if (hasActiveTool) {
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      return;
    }
    const textLen =
      last.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text ?? "")
        .join("").length ?? 0;
    if (textLen !== lastAssistantLenRef.current) {
      lastAssistantLenRef.current = textLen;
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      respondingTimerRef.current = setTimeout(() => {
        console.log("[NEXUS] Agent response stabilized, marking done");
        setIsAgentResponding(false);
        lastAssistantLenRef.current = 0;
      }, 1200);
    }
  }, [messages, isAgentResponding]);

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
      });
    } else if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
    }
  }, [activeId, setMessages]);

  useEffect(() => {
    if (!hasLoadedRef.current || messages.length === 0) return;

    const id = convIdRef.current;
    conversationPersistenceService.schedule({
      conversationId: id,
      messages,
      onPersistMeta: (pendingMessages) => {
        const firstUserMsg = pendingMessages.find(
          (m: any) => m.role === "user",
        ) as any;
        const title =
          firstUserMsg?.parts
            ?.find((p: any) => p.type === "text")
            ?.text?.substring(0, 60) ?? "New Chat";
        const lastMsg = pendingMessages[pendingMessages.length - 1] as any;
        const lastText =
          lastMsg?.parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ") ?? "";
        upsertConversation({
          id,
          title,
          preview: lastText.substring(0, 100),
          timestamp: Date.now(),
          messageCount: pendingMessages.length,
        });
      },
    });

    return () => {
      conversationPersistenceService.flush();
    };
  }, [messages, upsertConversation]);

  useEffect(() => {
    if (!extractionRef.current && messages.length >= 4) {
      const last = messages[messages.length - 1] as any;
      const secondLast =
        messages.length >= 2 ? (messages[messages.length - 2] as any) : null;
      if (last?.role === "assistant" && secondLast?.role === "user") {
        const userText =
          secondLast.parts?.find((p: any) => p.type === "text")?.text ?? "";
        const assistantText =
          last.parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ") ?? "";
        if (shouldExtractMemory(userText, assistantText)) {
          extractionRef.current = true;
          extractMemoryCandidates(userText, assistantText)
            .then(async (candidates) => {
              for (const c of candidates) {
                const entry: MemoryEntry = {
                  id: generateId(),
                  content: c.content,
                  keywords: c.keywords,
                  category: c.category as MemoryCategory,
                  timestamp: Date.now(),
                  importance: c.importance,
                  source: "auto-extract",
                  accessCount: 0,
                  lastAccessed: Date.now(),
                  relations: [],
                  consolidated: false,
                  decay: 1.0,
                  activationLevel: 0,
                  emotionalValence: 0,
                  contextSignature: "",
                };
                addMemory(entry);
                try {
                  const allMems = await loadMemories();
                  const existingLinks = await loadAssociativeLinks();
                  const newLinks = buildAssociativeLinks(
                    entry,
                    allMems,
                    existingLinks,
                  );
                  if (newLinks.length > 0)
                    await saveAssociativeLinks([...existingLinks, ...newLinks]);
                  scheduleAssociativeLinkPruning();
                } catch (e) {
                  console.log("[NEXUS] Auto-link error", e);
                }
              }
              extractionRef.current = false;
            })
            .catch(() => {
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

  const handleSend = useCallback(
    async (
      text: string,
      files?: ChatFile[],
      options?: { isVoiceMode?: boolean },
    ) => {
      if (!text.trim() && (!files || files.length === 0)) return;
      console.log(
        "[NEXUS] Sending:",
        text.substring(0, 50),
        files ? `with ${files.length} file(s)` : "",
        options?.isVoiceMode ? "(voice)" : "",
      );
      hasLoadedRef.current = true;
      setIsAgentResponding(true);
      lastAssistantLenRef.current = 0;
      if (respondingTimerRef.current) clearTimeout(respondingTimerRef.current);
      const memories = await loadMemories();
      const systemPrompt = await getEnhancedSystemPrompt(
        memories,
        text,
        messages,
        { isVoiceMode: options?.isVoiceMode },
      );
      const userText = text.trim();

      if (useLocalLLM && isCoreMLAvailable) {
        const base = Array.isArray(messages) ? (messages as any[]) : [];

        try {
          const { thread, assistantId } = appendUserAndAssistantPlaceholder(
            base,
            userText,
          );
          setMessages(thread as any);
          const finalText = await generateCoreML(systemPrompt, userText);

          const updated = thread.map((message: any) =>
            message.id === assistantId
              ? {
                  ...message,
                  parts: [{ type: "text", text: finalText }],
                }
              : message,
          );
          setMessages(updated as any);
        } catch (error: unknown) {
          const userMessage = {
            id: generateId(),
            role: "user",
            parts: [{ type: "text", text: userText }],
          };
          const assistantErr: any = {
            id: generateId(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text:
                  error instanceof Error
                    ? error.message
                    : "CoreML generation failed.",
              },
            ],
          };
          setMessages([...base, userMessage, assistantErr] as any);
        }
        setIsAgentResponding(false);
        return;
      }

      const messagePayload: any = { text: userText, systemPrompt };
      if (files && files.length > 0) {
        messagePayload.files = files;
      }
      sendMessage(messagePayload);
    },
    [
      sendMessage,
      messages,
      useLocalLLM,
      isCoreMLAvailable,
      setMessages,
      generateCoreML,
    ],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend],
  );

  const renderMessage = useCallback(({ item }: { item: any }) => {
    return (
      <View>
        {item.parts.map((part: any, i: number) => {
          if (part.type === "text" && part.text) {
            return (
              <ChatBubble
                key={`${item.id}-${i}`}
                role={item.role as "user" | "assistant"}
                text={part.text}
              />
            );
          }
          if (part.type === "tool" && part.toolName) {
            return (
              <ToolCard
                key={`${item.id}-${i}`}
                toolName={part.toolName}
                state={part.state ?? "pending"}
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
    if (isAgentResponding) return true;
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1] as any;
    if (last.role === "user") return true;
    return last.parts.some(
      (p: any) =>
        p.type === "tool" &&
        (p.state === "input-streaming" || p.state === "input-available"),
    );
  }, [messages, isAgentResponding]);

  const streamingAssistantText = useMemo(() => {
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1] as any;
    if (last.role !== "assistant") return "";
    return (
      last.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ") ?? ""
    );
  }, [messages]);

  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
        <EmptyState onSuggestion={handleSuggestion} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages as any[]}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={isStreaming ? <TypingIndicator /> : null}
        />
      )}
      {error && !dismissed && (
        <View style={styles.errorBar}>
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>
              {error.message === "Load failed" ||
              error.message === "Failed to fetch"
                ? "Connection error — check your network"
                : (error.message ?? "Something went wrong")}
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setDismissed(true);
                  const lastUserMsg = [...messages]
                    .reverse()
                    .find((m: any) => m.role === "user") as any;
                  const lastText = lastUserMsg?.parts?.find(
                    (p: any) => p.type === "text",
                  )?.text;
                  if (lastText) handleSend(lastText);
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
      <View style={styles.localToggleRow}>
        <Text style={styles.localToggleText}>
          On-device (CoreML): {coreMLLoadStatus.state}
        </Text>
        <Switch
          value={useLocalLLM}
          onValueChange={(v) => setUseLocalLLM(v)}
          disabled={!isCoreMLAvailable}
        />
      </View>
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        onOpenVoiceMode={() => setVoiceModeVisible(true)}
      />
      <VoiceMode
        visible={voiceModeVisible}
        onClose={() => setVoiceModeVisible(false)}
        onSend={(text) => {
          handleSend(text, undefined, { isVoiceMode: true });
        }}
        isResponding={isStreaming}
        lastAssistantText={
          messages.length > 0
            ? ((messages[messages.length - 1] as any)?.parts
                ?.filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join(" ") ?? "")
            : ""
        }
        streamingText={isStreaming ? streamingAssistantText : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  messageList: { paddingTop: 12, paddingBottom: 12 },
  typingWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: "row",
    backgroundColor: Colors.dark.assistantBubble,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 5,
    alignSelf: "flex-start",
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  errorBar: {
    backgroundColor: Colors.dark.errorDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  errorText: { color: Colors.dark.error, fontSize: 13, flex: 1 },
  errorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" as const },
  dismissBtn: { padding: 4 },
  localToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  localToggleText: { color: Colors.dark.textSecondary, fontSize: 12 },
});
