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
  Platform,
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
import { saveMessages, loadMessages } from "@/utils/conversations";
import {
  loadMemories,
  searchMemories,
  generateId,
  reinforceMemory,
  saveMemories,
  buildAssociativeLinks,
  loadAssociativeLinks,
  saveAssociativeLinks,
} from "@/utils/memory";
import {
  extractMemoryCandidates,
  getEnhancedSystemPrompt,
} from "@/utils/context";
import {
  analyzeEmotion,
  assessMetacognition,
  buildThoughtTree,
  detectCuriosity,
  buildEmotionalMimicry,
} from "@/utils/cognition";
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
  const { activeId, setActiveId, upsertConversation, addMemory, startNewChat } =
    useConversations();
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

  const tools = useMemo(
    () => ({
      webSearch: createRorkTool({
        description:
          "Search the internet for current information, news, facts, or real-time data.",
        zodSchema: z.object({
          query: z.string().describe("Search query"),
        }),
        async execute(input: { query: string }) {
          console.log("[NEXUS] Web search:", input.query);
          try {
            const response = await fetch(
              `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`,
            );
            const data = await response.json();
            const results: string[] = [];
            if (data.Abstract) results.push(`Summary: ${data.Abstract}`);
            if (data.RelatedTopics) {
              for (const topic of data.RelatedTopics.slice(0, 5)) {
                if (topic.Text) results.push(`- ${topic.Text}`);
              }
            }
            return results.length > 0
              ? `Search results for "${input.query}":\n\n${results.join("\n")}`
              : `No structured results for "${input.query}". Answer from knowledge and note limitations.`;
          } catch {
            return `Search failed for "${input.query}". Answer from knowledge.`;
          }
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
          return `Analysis: ${(input.framework ?? "general").toUpperCase()} | "${input.topic}". Provide structured analysis with evidence-based reasoning.`;
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
          try {
            console.log(
              "[NEXUS] Generating image:",
              input.prompt.substring(0, 60),
            );
            const response = await fetch(
              "https://toolkit.rork.com/images/generate/",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: input.prompt,
                  size: input.size ?? "1024x1024",
                }),
              },
            );
            if (!response.ok) {
              console.log(
                "[NEXUS] Image API error:",
                response.status,
                response.statusText,
              );
              return JSON.stringify({
                error: true,
                message: `Image API returned ${response.status}. Try again.`,
              });
            }
            const data = await response.json();
            console.log("[NEXUS] Image response keys:", Object.keys(data));
            if (data.image?.base64Data) {
              const mimeType = data.image.mimeType ?? "image/png";
              return JSON.stringify({
                success: true,
                imageUri: `data:${mimeType};base64,${data.image.base64Data}`,
                prompt: input.prompt.substring(0, 100),
              });
            }
            console.log(
              "[NEXUS] No image data in response:",
              JSON.stringify(data).substring(0, 200),
            );
            return JSON.stringify({
              error: true,
              message:
                "No image data in response. The service may be temporarily unavailable.",
            });
          } catch (e: unknown) {
            console.log("[NEXUS] Image generation error:", e);
            return JSON.stringify({
              error: true,
              message: `Image generation failed: ${e instanceof Error ? e.message : "Unknown error"}`,
            });
          }
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
          const memories = await loadMemories();
          const relevant = searchMemories(memories, input.problem, {
            maxResults: 5,
          });
          const meta = assessMetacognition(input.problem, 0);
          const tree = buildThoughtTree(input.problem, relevant, meta);
          const branches = tree.branches
            .filter((b) => !b.pruned)
            .slice(0, 4)
            .map((b) => `[${(b.confidence * 100).toFixed(0)}%] ${b.hypothesis}`)
            .join("\n");
          return `## Analysis\nProblem: "${input.problem}"\nComplexity: ${meta.reasoningComplexity} | Convergence: ${(tree.convergenceScore * 100).toFixed(0)}%\n\n${branches}\n\nExplore highest-confidence paths and synthesize.`;
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
          return `## Uncertainty\nTopic: ${input.topic}\nReason: ${input.uncertaintyReason.replace(/_/g, " ")}${input.whatYouKnow ? `\nPartial: ${input.whatYouKnow}` : ""}\nAction: ${input.suggestedAction.replace(/_/g, " ")}`;
        },
      }),
    }),
    [addMemory],
  );

  const [dismissed, setDismissed] = useState(false);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [isAgentResponding, setIsAgentResponding] = useState(false);
  const [useLocalLLM, setUseLocalLLM] = useState(false);
  const [coreML, setCoreML] = useState<null | {
    loadModel: (opts: any) => Promise<any>;
    isLoaded: () => Promise<boolean>;
    generate: (prompt: string, opts?: any) => Promise<string>;
  }>(null);
  const lastAssistantLenRef = useRef(0);
  const respondingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    import("@/modules/expo-coreml-llm")
      .then((mod: any) => {
        if (mod?.CoreMLLLM) setCoreML(mod.CoreMLLLM);
      })
      .catch(() => {
        setCoreML(null);
      });
  }, []);

  const { messages, sendMessage, setMessages, error } = useRorkAgent({
    tools,
  });

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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const id = convIdRef.current;
      saveMessages(id, messages);
      const firstUserMsg = messages.find((m: any) => m.role === "user") as any;
      const title =
        firstUserMsg?.parts
          ?.find((p: any) => p.type === "text")
          ?.text?.substring(0, 60) ?? "New Chat";
      const lastMsg = messages[messages.length - 1] as any;
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
        if (userText.length > 20 && assistantText.length > 20) {
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
                } catch (_e) {
                  console.log("[NEXUS] Auto-link error");
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

      if (useLocalLLM && Platform.OS === "ios") {
        const userMsg: any = {
          id: generateId(),
          role: "user",
          parts: [{ type: "text", text: userText }],
        };
        const base = Array.isArray(messages) ? (messages as any[]) : [];
        if (!coreML) {
          const assistantErr: any = {
            id: generateId(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "CoreML module not linked. Do: npx expo prebuild --clean, then build/run a dev client on iOS.",
              },
            ],
          };
          setMessages([...base, userMsg, assistantErr] as any);
          setIsAgentResponding(false);
          return;
        }

        const assistantMsgId = generateId();
        const assistantPlaceholder: any = {
          id: assistantMsgId,
          role: "assistant",
          parts: [{ type: "text", text: "" }],
        };
        const localThread = [...base, userMsg, assistantPlaceholder];
        setMessages(localThread as any);

        const loaded = await coreML.isLoaded();
        if (!loaded) {
          await coreML.loadModel({
            modelName: "MyLLM",
            inputIdsName: "input_ids",
            attentionMaskName: "attention_mask",
            logitsName: "logits",
            computeUnits: "all",
            eosTokenId: 50256,
          });
        }

        const prompt = `${systemPrompt}\n\nUser: ${userText}\nAssistant:`;
        const raw = await coreML.generate(prompt, {
          maxNewTokens: 220,
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          repetitionPenalty: 1.05,
          tokenizer: {
            vocabJsonAssetPath: "module:tokenizers/gpt2/vocab.json",
            mergesTxtAssetPath: "module:tokenizers/gpt2/merges.txt",
            eosTokenId: 50256,
          },
        });

        const cleaned = raw.startsWith(prompt) ? raw.slice(prompt.length) : raw;
        const finalText = cleaned.replace(/^\s+/, "").trimEnd();
        const updated = localThread.map((m: any) =>
          m.id === assistantMsgId
            ? {
                ...m,
                parts: [{ type: "text", text: finalText || "(no output)" }],
              }
            : m,
        );
        setMessages(updated as any);

        setIsAgentResponding(false);
        return;
      }

      const messagePayload: any = { text: userText, systemPrompt };
      if (files && files.length > 0) {
        messagePayload.files = files;
      }
      sendMessage(messagePayload);
    },
    [sendMessage, messages, useLocalLLM, coreML, setMessages],
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
                  if (lastText) sendMessage(lastText);
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
        <Text style={styles.localToggleText}>On-device (CoreML)</Text>
        <Switch
          value={useLocalLLM}
          onValueChange={(v) => setUseLocalLLM(v)}
          disabled={Platform.OS !== "ios" || !coreML}
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
