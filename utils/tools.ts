import { createRorkTool } from "@rork-ai/toolkit-sdk";
import { z } from "zod";
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
} from "@/utils/memory";
import {
  analyzeEmotion,
  assessMetacognition,
  buildThoughtTree,
  buildEmotionalMimicry,
} from "@/utils/cognition";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import { validateWebScrapeUrl } from "@/utils/webScrape";
import { MemoryEntry, MemoryCategory } from "@/types";

function getWebSearchTimeoutMs(): number {
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
}

export async function runWebSearch(query: string): Promise<string> {
  console.log("[NEXUS] Web search:", query);
  try {
    const response = await fetchWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {},
      getWebSearchTimeoutMs(),
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
      ? `Search results for "${query}":\n\n${results.join("\n")}`
      : `No structured results for "${query}". Answer from knowledge and note limitations.`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return `Search timeout for "${query}". Answer from knowledge and note limitations.`;
    }
    return `Search failed for "${query}". Answer from knowledge.`;
  }
}

async function runCognitiveAnalysis(
  problem: string,
  messageCount: number,
  preloadedMemories?: MemoryEntry[],
): Promise<string> {
  const memories = preloadedMemories ?? (await loadMemories());
  const relevant = searchMemories(memories, problem, { maxResults: 5 });
  const meta = assessMetacognition(problem, messageCount);
  const tree = buildThoughtTree(problem, relevant, meta);
  const branches = tree.branches
    .filter((b) => !b.pruned)
    .slice(0, 4)
    .map((b) => `[${(b.confidence * 100).toFixed(0)}%] ${b.hypothesis}`)
    .join("\n");
  return `## Analysis\nProblem: "${problem}"\nComplexity: ${meta.reasoningComplexity} | Convergence: ${(tree.convergenceScore * 100).toFixed(0)}%\n\n${branches}\n\nExplore highest-confidence paths and synthesize.`;
}

interface CreateToolsOptions {
  addMemory: (entry: MemoryEntry) => void;
  getMessageCount: () => number;
}

export function createAgentTools(options: CreateToolsOptions) {
  const { addMemory, getMessageCount } = options;

  return {
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
          const newLinks = buildAssociativeLinks(entry, allMems, existingLinks);
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
        const msgCount = getMessageCount();
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
              runCognitiveAnalysis(
                `${input.topic} — ${dimension}`,
                msgCount,
                memories,
              ),
            ),
          );
          return `## Deep Analysis: SWOT\nTopic: ${input.topic}\n\n${dimensions
            .map(
              (dimension, idx) => `### ${dimension}\n${branchAnalyses[idx]}`,
            )
            .join("\n\n")}`;
        }

        if (framework === "pros_cons") {
          const dimensions = ["Pros", "Cons"];
          const memories = await loadMemories();
          const branchAnalyses = await Promise.all(
            dimensions.map((dimension) =>
              runCognitiveAnalysis(
                `${input.topic} — ${dimension}`,
                msgCount,
                memories,
              ),
            ),
          );
          return `## Deep Analysis: Pros/Cons\nTopic: ${input.topic}\n\n${dimensions
            .map(
              (dimension, idx) => `### ${dimension}\n${branchAnalyses[idx]}`,
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
        const { safeUrl, errorMessage } = validateWebScrapeUrl(input.url);
        if (!safeUrl) {
          return errorMessage ?? "Invalid URL.";
        }
        console.log("[NEXUS] Scraping:", safeUrl);
        try {
          const response = await fetchWithTimeout(
            safeUrl,
            {
              headers: {
                Accept: "text/html,text/plain,application/json",
                "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)",
              },
            },
            10000,
          );
          const text = await response.text();
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("json")) {
            return `JSON from ${safeUrl}:\n\`\`\`json\n${JSON.stringify(JSON.parse(text), null, 2).substring(0, 3000)}\n\`\`\``;
          }
          const cleaned = text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return `Content from ${safeUrl} (${cleaned.length} chars):\n\n${cleaned.substring(0, 3000)}`;
        } catch (e: unknown) {
          return `Failed to fetch ${safeUrl}: ${e instanceof Error ? e.message : "Unknown error"}`;
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
            const response = await fetchWithTimeout(
              "https://toolkit.rork.com/images/generate/",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: input.prompt,
                  size: input.size ?? "1024x1024",
                }),
              },
              60000,
            );
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
            } catch {
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
          // eslint-disable-next-line no-implied-eval
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
        return runCognitiveAnalysis(input.problem, getMessageCount());
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
          return `## Uncertainty\nTopic: ${input.topic}\nReason: ${input.uncertaintyReason.replace(/_/g, " ")}\nAction: search web\n\n${searchResults}`;
        }
        return `## Uncertainty\nTopic: ${input.topic}\nReason: ${input.uncertaintyReason.replace(/_/g, " ")}${
          input.whatYouKnow
            ? `\nPartial: ${input.whatYouKnow}`
            : ""
        }\nAction: ${input.suggestedAction.replace(/_/g, " ")}`;
      },
    }),
  };
}
