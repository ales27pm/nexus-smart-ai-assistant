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
import { ToolDefinition } from "@/hooks/useLlamaChat";

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

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const schemaDef = (schema as any)._zpiDef ?? (schema as any)._def ?? (schema as any).def;
  if (!schemaDef) return { type: "object", properties: {} };

  const typeName = schemaDef.typeName ?? schemaDef.type ?? '';

  if (typeName === 'ZodObject' || (schema as any).shape) {
    const shape = (schema as any).shape as Record<string, z.ZodType> | undefined;
    if (!shape) return { type: "object", properties: {} };
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const valueDef = (value as any)._zpiDef ?? (value as any)._def ?? (value as any).def;
      const valueTypeName = valueDef?.typeName ?? valueDef?.type ?? '';
      const isOptional = valueTypeName === 'ZodOptional';

      if (!isOptional) required.push(key);

      const innerType = isOptional
        ? (valueDef?.innerType ?? valueDef?.value ?? value)
        : value;
      properties[key] = zodTypeToJson(innerType as z.ZodType);
    }

    return { type: "object", properties, required };
  }
  return { type: "object", properties: {} };
}

function zodTypeToJson(t: z.ZodType): Record<string, unknown> {
  const def = (t as any)._zpiDef ?? (t as any)._def ?? (t as any).def;
  const typeName: string = def?.typeName ?? def?.type ?? '';
  const desc: string = (def?.description ?? (t as any).description ?? '') as string;

  if (typeName === 'ZodString' || typeName === 'string') return { type: "string", description: desc };
  if (typeName === 'ZodNumber' || typeName === 'number') return { type: "number", description: desc };
  if (typeName === 'ZodEnum' || typeName === 'enum') {
    const values = def?.values ?? def?.entries ?? [];
    return { type: "string", enum: values, description: desc };
  }
  if (typeName === 'ZodArray' || typeName === 'array') {
    const element = def?.type ?? def?.element ?? def?.items;
    return { type: "array", items: element ? zodTypeToJson(element as z.ZodType) : { type: "string" }, description: desc };
  }
  if (typeName === 'ZodOptional' || typeName === 'optional') {
    const inner = def?.innerType ?? def?.value ?? t;
    return zodTypeToJson(inner as z.ZodType);
  }
  return { type: "string", description: desc };
}

interface CreateToolsOptions {
  addMemory: (entry: MemoryEntry) => void;
  getMessageCount: () => number;
}

export function createAgentTools(options: CreateToolsOptions): Record<string, ToolDefinition> {
  const { addMemory, getMessageCount } = options;

  return {
    webSearch: {
      description:
        "Search the internet for current information, news, facts, or real-time data.",
      parameters: zodToJsonSchema(z.object({
        query: z.string().describe("Search query"),
      })),
      async execute(input: Record<string, unknown>) {
        return runWebSearch(input.query as string);
      },
    },

    storeMemory: {
      description:
        "Store info in persistent memory. Use when user shares preferences, goals, instructions, or says 'remember'.",
      parameters: zodToJsonSchema(z.object({
        content: z.string().describe("Information to store"),
        keywords: z.array(z.string()).describe("3-6 keywords"),
        category: z.enum([
          "preference", "fact", "instruction", "context", "goal", "persona", "skill", "entity", "episodic",
        ]),
        importance: z.number().describe("1=trivial, 5=critical"),
      })),
      async execute(input: Record<string, unknown>) {
        const content = input.content as string;
        const keywords = input.keywords as string[];
        const category = input.category as string;
        const importance = input.importance as number;
        console.log("[NEXUS] Storing:", content.substring(0, 60));
        const entry: MemoryEntry = {
          id: generateId(),
          content,
          keywords,
          category: category as MemoryCategory,
          timestamp: Date.now(),
          importance,
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
        return `Stored [${category}/${importance}★]: "${content.substring(0, 80)}"`;
      },
    },

    recallMemory: {
      description:
        "Search user's memory bank for preferences, past facts, or stored info.",
      parameters: zodToJsonSchema(z.object({
        query: z.string().describe("Search query"),
        category: z.enum([
          "preference", "fact", "instruction", "context", "goal", "persona", "skill", "entity", "episodic", "all",
        ]).optional(),
        maxResults: z.number().optional(),
      })),
      async execute(input: Record<string, unknown>) {
        const query = input.query as string;
        const categoryInput = input.category as string | undefined;
        const maxResults = (input.maxResults as number) ?? 8;
        console.log("[NEXUS] Recalling:", query);
        const memories = await loadMemories();
        const categoryFilter =
          categoryInput && categoryInput !== "all"
            ? [categoryInput as MemoryCategory]
            : undefined;
        const results = searchMemories(memories, query, {
          maxResults,
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
    },

    deepAnalysis: {
      description:
        "Structured multi-dimensional analysis for complex topics.",
      parameters: zodToJsonSchema(z.object({
        topic: z.string().describe("Subject to analyze"),
        framework: z.enum([
          "swot", "pros_cons", "comparison", "root_cause", "decision_matrix", "general",
        ]).optional(),
      })),
      async execute(input: Record<string, unknown>) {
        const topic = input.topic as string;
        const framework = (input.framework as string) ?? "general";
        const msgCount = getMessageCount();
        if (framework === "swot") {
          const dimensions = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
          const memories = await loadMemories();
          const branchAnalyses = await Promise.all(
            dimensions.map((dimension) =>
              runCognitiveAnalysis(`${topic} — ${dimension}`, msgCount, memories),
            ),
          );
          return `## Deep Analysis: SWOT\nTopic: ${topic}\n\n${dimensions
            .map((dimension, idx) => `### ${dimension}\n${branchAnalyses[idx]}`)
            .join("\n\n")}`;
        }
        if (framework === "pros_cons") {
          const dimensions = ["Pros", "Cons"];
          const memories = await loadMemories();
          const branchAnalyses = await Promise.all(
            dimensions.map((dimension) =>
              runCognitiveAnalysis(`${topic} — ${dimension}`, msgCount, memories),
            ),
          );
          return `## Deep Analysis: Pros/Cons\nTopic: ${topic}\n\n${dimensions
            .map((dimension, idx) => `### ${dimension}\n${branchAnalyses[idx]}`)
            .join("\n\n")}`;
        }
        return `Analysis: ${framework.toUpperCase()} | "${topic}". Provide structured analysis with evidence-based reasoning.`;
      },
    },

    webScrape: {
      description: "Fetch and extract content from a URL.",
      parameters: zodToJsonSchema(z.object({
        url: z.string().describe("URL to fetch"),
      })),
      async execute(input: Record<string, unknown>) {
        const { safeUrl, errorMessage } = validateWebScrapeUrl(input.url as string);
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
    },

    calculator: {
      description: "Evaluate math expressions. Use instead of mental math.",
      parameters: zodToJsonSchema(z.object({
        expression: z.string().describe("Math expression"),
      })),
      async execute(input: Record<string, unknown>) {
        try {
          let expr = (input.expression as string)
            .replace(/(\d+)%\s*of\s*(\d+(?:\.\d+)?)/gi, "($1/100)*$2")
            .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
          const safeExpr = expr.replace(
            /[^0-9+\-*/().%,\s]|Math\.\w+/g,
            (m) => (m.startsWith("Math.") ? m : ""),
          );
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const fn = new Function("Math", `return (${safeExpr})`);
          const result = fn(Math);
          if (typeof result !== "number" || !isFinite(result))
            return `Could not evaluate: "${String(input.expression)}"`;
          const formatted = Number.isInteger(result)
            ? result.toString()
            : result.toFixed(6).replace(/\.?0+$/, "");
          return `${String(input.expression)} = ${formatted}`;
        } catch (e: unknown) {
          return `Error: ${e instanceof Error ? e.message : "Unknown"}`;
        }
      },
    },

    cognitiveAnalysis: {
      description: "Tree of Thought reasoning for complex problems.",
      parameters: zodToJsonSchema(z.object({
        problem: z.string().describe("Problem to reason through"),
        preferredApproach: z.enum(["analytical", "creative", "balanced", "adversarial"]).optional(),
      })),
      async execute(input: Record<string, unknown>) {
        return runCognitiveAnalysis(input.problem as string, getMessageCount());
      },
    },

    emotionalPulse: {
      description: "Analyze emotional undertone and adapt response.",
      parameters: zodToJsonSchema(z.object({
        context: z.string().describe("Context to analyze"),
      })),
      async execute(input: Record<string, unknown>) {
        const emotion = analyzeEmotion(input.context as string);
        const mimicry = buildEmotionalMimicry(emotion);
        return `Emotion: ${emotion.valence}/${emotion.arousal}, ${emotion.dominantEmotion}\nStyle: ${emotion.style}\n\n${mimicry}`;
      },
    },

    askClarification: {
      description: "Ask clarifying question when request is ambiguous.",
      parameters: zodToJsonSchema(z.object({
        originalQuery: z.string(),
        ambiguityType: z.enum([
          "vague_reference", "multiple_interpretations", "missing_context", "unclear_scope", "unclear_intent",
        ]),
        possibleInterpretations: z.array(z.string()),
        clarifyingQuestion: z.string(),
        bestGuess: z.string().optional(),
      })),
      async execute(input: Record<string, unknown>) {
        const possibleInterpretations = input.possibleInterpretations as string[];
        const interps = possibleInterpretations
          .map((i, idx) => `${idx + 1}. ${i}`)
          .join("\n");
        const bestGuessStr = typeof input.bestGuess === 'string' ? input.bestGuess : '';
        const clarifyingQ = String(input.clarifyingQuestion);
        return `## Clarification Needed\nType: ${(input.ambiguityType as string).replace(/_/g, " ")}\nInterpretations:\n${interps}\n${bestGuessStr ? `Best guess: ${bestGuessStr}\n` : ""}Ask: ${clarifyingQ}`;
      },
    },

    admitUncertainty: {
      description:
        "Use when you don't know the answer. Follow with webSearch.",
      parameters: zodToJsonSchema(z.object({
        topic: z.string(),
        uncertaintyReason: z.enum([
          "outside_training", "time_sensitive", "too_specific", "conflicting_info", "no_knowledge", "low_confidence",
        ]),
        whatYouKnow: z.string().optional(),
        suggestedAction: z.enum(["search_web", "ask_user", "provide_partial", "defer"]),
      })),
      async execute(input: Record<string, unknown>) {
        const topic = input.topic as string;
        const uncertaintyReason = input.uncertaintyReason as string;
        const whatYouKnow = input.whatYouKnow as string | undefined;
        const suggestedAction = input.suggestedAction as string;

        if (suggestedAction === "search_web") {
          const searchQuery = whatYouKnow ? `${topic} ${whatYouKnow}` : topic;
          const searchResults = await runWebSearch(searchQuery);
          return `## Uncertainty\nTopic: ${topic}\nReason: ${uncertaintyReason.replace(/_/g, " ")}\nAction: search web\n\n${searchResults}`;
        }
        return `## Uncertainty\nTopic: ${topic}\nReason: ${uncertaintyReason.replace(/_/g, " ")}${
          whatYouKnow ? `\nPartial: ${whatYouKnow}` : ""
        }\nAction: ${suggestedAction.replace(/_/g, " ")}`;
      },
    },
  };
}
