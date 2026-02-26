import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MemoryEntry,
  RetrievalResult,
  MemoryCategory,
  AssociativeLink,
  SpreadingActivation,
} from "@/types";

const MEMORY_KEY = "nexus_memory_bank";
const LINKS_KEY = "nexus_associative_links";
const ASSOCIATIVE_LINK_MIN_STRENGTH = 0.1;
let associativePruneTask: ReturnType<typeof setTimeout> | null = null;

export async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const memories = JSON.parse(raw) as MemoryEntry[];
    return memories.map(migrateMemory);
  } catch (e) {
    console.log("[NEXUS] Failed to load memories:", e);
    return [];
  }
}

export async function saveMemories(memories: MemoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
    console.log("[NEXUS] Saved", memories.length, "memories");
  } catch (e) {
    console.log("[NEXUS] Failed to save memories:", e);
  }
}

export async function loadAssociativeLinks(): Promise<AssociativeLink[]> {
  try {
    const raw = await AsyncStorage.getItem(LINKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AssociativeLink[];
  } catch (e) {
    console.log("[NEXUS] Failed to load links:", e);
    return [];
  }
}

export async function saveAssociativeLinks(
  links: AssociativeLink[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch (e) {
    console.log("[NEXUS] Failed to save links:", e);
  }
}

export function scheduleAssociativeLinkPruning(delayMs = 3000): void {
  if (associativePruneTask) clearTimeout(associativePruneTask);
  associativePruneTask = setTimeout(() => {
    pruneWeakAssociativeLinks().catch((e) => {
      console.log("[NEXUS] Failed to prune associative links:", e);
    });
  }, delayMs);
}

export async function pruneWeakAssociativeLinks(
  minStrength = ASSOCIATIVE_LINK_MIN_STRENGTH,
): Promise<number> {
  const links = await loadAssociativeLinks();
  if (links.length === 0) return 0;
  const pruned = links.filter((link) => link.strength >= minStrength);
  const removed = links.length - pruned.length;
  if (removed > 0) {
    await saveAssociativeLinks(pruned);
    console.log("[NEXUS] Pruned weak associative links:", removed);
  }
  return removed;
}

export type MemoryExtractionPolicy = {
  minUserChars?: number;
  minAssistantChars?: number;
};

export function shouldExtractMemory(
  userText: string,
  assistantText: string,
  policy: MemoryExtractionPolicy = {},
): boolean {
  const minUserChars = policy.minUserChars ?? 20;
  const minAssistantChars = policy.minAssistantChars ?? 20;

  return (
    userText.trim().length >= minUserChars &&
    assistantText.trim().length >= minAssistantChars
  );
}
function migrateMemory(
  m: Partial<MemoryEntry> & { id: string; content: string },
): MemoryEntry {
  return {
    id: m.id,
    content: m.content,
    keywords: m.keywords ?? [],
    category: (m.category as MemoryCategory) ?? "context",
    timestamp: m.timestamp ?? Date.now(),
    importance: m.importance ?? 3,
    source: m.source ?? "conversation",
    accessCount: m.accessCount ?? 0,
    lastAccessed: m.lastAccessed ?? m.timestamp ?? Date.now(),
    embedding: m.embedding,
    relations: m.relations ?? [],
    consolidated: m.consolidated ?? false,
    decay: m.decay ?? 1.0,
    activationLevel: m.activationLevel ?? 0,
    emotionalValence: m.emotionalValence ?? 0,
    contextSignature: m.contextSignature ?? "",
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildIDF(memories: MemoryEntry[]): Map<string, number> {
  const docCount = memories.length || 1;
  const termDocFreq = new Map<string, number>();

  for (const m of memories) {
    const terms = new Set(tokenize(m.content + " " + m.keywords.join(" ")));
    for (const t of terms) {
      termDocFreq.set(t, (termDocFreq.get(t) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, freq] of termDocFreq) {
    idf.set(term, Math.log((docCount + 1) / (freq + 1)) + 1);
  }
  return idf;
}

function computeTFIDF(
  text: string,
  idf: Map<string, number>,
): Map<string, number> {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }

  const tfidf = new Map<string, number>();
  const maxTF = Math.max(...Array.from(tf.values()), 1);

  for (const [term, freq] of tf) {
    const normalizedTF = 0.5 + (0.5 * freq) / maxTF;
    const idfVal = idf.get(term) ?? 1;
    tfidf.set(term, normalizedTF * idfVal);
  }
  return tfidf;
}

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, val] of a) {
    magA += val * val;
    const bVal = b.get(term);
    if (bVal !== undefined) {
      dot += val * bVal;
    }
  }
  for (const val of b.values()) {
    magB += val * val;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function computeDecay(memory: MemoryEntry): number {
  const hoursSinceAccess =
    (Date.now() - memory.lastAccessed) / (1000 * 60 * 60);
  const hoursSinceCreation = (Date.now() - memory.timestamp) / (1000 * 60 * 60);

  const accessBoost = Math.min(memory.accessCount * 0.1, 0.5);
  const importanceBoost = (memory.importance / 5) * 0.3;

  const halfLife = 168 * (1 + accessBoost + importanceBoost);
  const decayFactor = Math.pow(0.5, hoursSinceAccess / halfLife);

  const freshnessBonus = hoursSinceCreation < 24 ? 0.2 : 0;

  return Math.max(0.05, Math.min(1.0, decayFactor + freshnessBonus));
}

export function searchMemories(
  memories: MemoryEntry[],
  query: string,
  options?: {
    maxResults?: number;
    minScore?: number;
    categoryFilter?: MemoryCategory[];
    recencyBias?: number;
    importanceBias?: number;
    diversityPenalty?: number;
  },
): RetrievalResult[] {
  const {
    maxResults = 8,
    minScore = 0.05,
    categoryFilter,
    recencyBias = 0.15,
    importanceBias = 0.2,
    diversityPenalty = 0.1,
  } = options ?? {};

  if (memories.length === 0) return [];

  const filtered = categoryFilter
    ? memories.filter((m) => categoryFilter.includes(m.category))
    : memories;

  if (filtered.length === 0) return [];

  const idf = buildIDF(filtered);
  const queryVec = computeTFIDF(query, idf);

  const scored: RetrievalResult[] = filtered.map((m) => {
    const docText = m.content + " " + m.keywords.join(" ") + " " + m.category;
    const docVec = computeTFIDF(docText, idf);

    const tfidfScore = cosineSimilarity(queryVec, docVec);

    const queryTerms = tokenize(query);
    let keywordBonus = 0;
    for (const term of queryTerms) {
      for (const kw of m.keywords) {
        if (
          kw.toLowerCase().includes(term) ||
          term.includes(kw.toLowerCase())
        ) {
          keywordBonus += 0.15;
        }
      }
    }
    keywordBonus = Math.min(keywordBonus, 0.4);

    const decay = computeDecay(m);
    const recencyScore = decay * recencyBias;
    const importanceScore = (m.importance / 5) * importanceBias;

    const activationBonus = (m.activationLevel ?? 0) * 0.15;

    const totalScore =
      tfidfScore +
      keywordBonus +
      recencyScore +
      importanceScore +
      activationBonus;

    let matchType: RetrievalResult["matchType"] =
      tfidfScore > keywordBonus ? "semantic" : "keyword";
    if (activationBonus > tfidfScore && activationBonus > keywordBonus) {
      matchType = "primed";
    }

    return { memory: m, score: totalScore, matchType };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: RetrievalResult[] = [];
  const seenCategories = new Set<string>();

  for (const result of scored) {
    if (result.score < minScore) continue;
    if (selected.length >= maxResults) break;

    let adjustedScore = result.score;
    if (seenCategories.has(result.memory.category)) {
      adjustedScore -= diversityPenalty;
    }

    if (adjustedScore >= minScore) {
      selected.push({ ...result, score: adjustedScore });
      seenCategories.add(result.memory.category);
    }
  }

  console.log(
    '[NEXUS] Memory search for "' + query.substring(0, 40) + '":',
    selected.length,
    "results",
  );
  return selected;
}

export function spreadActivation(
  startMemories: MemoryEntry[],
  allMemories: MemoryEntry[],
  links: AssociativeLink[],
  depth: number = 2,
  decayRate: number = 0.5,
): SpreadingActivation[] {
  const activations = new Map<string, SpreadingActivation>();

  for (const mem of startMemories) {
    activations.set(mem.id, {
      nodeId: mem.id,
      activationLevel: 1.0,
      depth: 0,
      path: [mem.id],
    });
  }

  for (let d = 0; d < depth; d++) {
    const currentLevel = [...activations.values()].filter((a) => a.depth === d);

    for (const active of currentLevel) {
      const outgoing = links.filter(
        (l) => l.sourceId === active.nodeId || l.targetId === active.nodeId,
      );

      for (const link of outgoing) {
        const neighborId =
          link.sourceId === active.nodeId ? link.targetId : link.sourceId;

        if (!allMemories.some((m) => m.id === neighborId)) continue;

        const propagatedLevel =
          active.activationLevel * link.strength * decayRate;

        if (propagatedLevel < 0.05) continue;

        const existing = activations.get(neighborId);
        if (!existing || existing.activationLevel < propagatedLevel) {
          activations.set(neighborId, {
            nodeId: neighborId,
            activationLevel: propagatedLevel,
            depth: d + 1,
            path: [...active.path, neighborId],
          });
        }
      }
    }
  }

  const result = [...activations.values()]
    .filter((a) => a.depth > 0)
    .sort((a, b) => b.activationLevel - a.activationLevel);

  console.log(
    "[NEXUS] Spreading activation:",
    result.length,
    "nodes activated from",
    startMemories.length,
    "seeds",
  );
  return result;
}

export function buildAssociativeLinks(
  newMemory: MemoryEntry,
  existingMemories: MemoryEntry[],
  existingLinks: AssociativeLink[],
): AssociativeLink[] {
  const newLinks: AssociativeLink[] = [];
  const newTokens = new Set(
    tokenize(newMemory.content + " " + newMemory.keywords.join(" ")),
  );

  for (const existing of existingMemories) {
    if (existing.id === newMemory.id) continue;

    const existingTokens = new Set(
      tokenize(existing.content + " " + existing.keywords.join(" ")),
    );
    let overlap = 0;
    for (const t of newTokens) {
      if (existingTokens.has(t)) overlap++;
    }
    const jaccardSim =
      overlap / (newTokens.size + existingTokens.size - overlap);

    if (jaccardSim < 0.1) continue;

    const alreadyLinked = existingLinks.some(
      (l) =>
        (l.sourceId === newMemory.id && l.targetId === existing.id) ||
        (l.sourceId === existing.id && l.targetId === newMemory.id),
    );

    if (alreadyLinked) continue;

    let linkType: AssociativeLink["type"] = "semantic";
    const timeDiff = Math.abs(newMemory.timestamp - existing.timestamp);
    if (timeDiff < 1000 * 60 * 5) {
      linkType = "temporal";
    } else if (newMemory.category === existing.category) {
      linkType = "topical";
    }

    const keywordOverlap = newMemory.keywords.filter((k) =>
      existing.keywords.some((ek) => ek.toLowerCase() === k.toLowerCase()),
    ).length;
    const strength = Math.min(1, jaccardSim + keywordOverlap * 0.15);

    if (strength > 0.15) {
      newLinks.push({
        sourceId: newMemory.id,
        targetId: existing.id,
        strength,
        type: linkType,
        createdAt: Date.now(),
        reinforcements: 0,
      });
    }
  }

  newLinks.sort((a, b) => b.strength - a.strength);
  console.log(
    "[NEXUS] Built",
    Math.min(newLinks.length, 8),
    "associative links for memory",
    newMemory.id,
  );
  return newLinks.slice(0, 8);
}

export function getAssociativeMemories(
  query: string,
  memories: MemoryEntry[],
  links: AssociativeLink[],
  directResults: RetrievalResult[],
): RetrievalResult[] {
  if (directResults.length === 0 || links.length === 0) return [];

  const seedMemories = directResults.slice(0, 3).map((r) => r.memory);
  const activations = spreadActivation(seedMemories, memories, links, 2, 0.5);

  const directIds = new Set(directResults.map((r) => r.memory.id));
  const associativeResults: RetrievalResult[] = [];

  for (const activation of activations) {
    if (directIds.has(activation.nodeId)) continue;

    const memory = memories.find((m) => m.id === activation.nodeId);
    if (!memory) continue;

    associativeResults.push({
      memory,
      score: activation.activationLevel * 0.6,
      matchType: "associative",
    });
  }

  console.log("[NEXUS] Associative memories found:", associativeResults.length);
  return associativeResults.slice(0, 4);
}

export function deduplicateMemories(memories: MemoryEntry[]): MemoryEntry[] {
  if (memories.length < 2) return memories;

  const idf = buildIDF(memories);
  const vectors = memories.map((m) =>
    computeTFIDF(m.content + " " + m.keywords.join(" "), idf),
  );

  const toRemove = new Set<number>();

  for (let i = 0; i < memories.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < memories.length; j++) {
      if (toRemove.has(j)) continue;
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim > 0.85) {
        const keepIdx =
          memories[i].importance >= memories[j].importance ? i : j;
        const removeIdx = keepIdx === i ? j : i;
        toRemove.add(removeIdx);
        console.log(
          "[NEXUS] Dedup: removing memory",
          memories[removeIdx].id,
          "sim=",
          sim.toFixed(2),
        );
      }
    }
  }

  return memories.filter((_, idx) => !toRemove.has(idx));
}

export function consolidateMemories(memories: MemoryEntry[]): MemoryEntry[] {
  const byCategory = new Map<string, MemoryEntry[]>();
  for (const m of memories) {
    const cat = m.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }

  const result: MemoryEntry[] = [];
  for (const [category, catMemories] of byCategory) {
    if (catMemories.length <= 10) {
      result.push(...catMemories);
      continue;
    }

    const withDecay = catMemories.map((m) => ({
      ...m,
      decay: computeDecay(m),
    }));

    withDecay.sort((a, b) => {
      const scoreA = a.importance * 0.4 + a.decay * 0.3 + a.accessCount * 0.1;
      const scoreB = b.importance * 0.4 + b.decay * 0.3 + b.accessCount * 0.1;
      return scoreB - scoreA;
    });

    const kept = withDecay.slice(0, 10);
    result.push(...kept);
    console.log(
      '[NEXUS] Consolidated category "' + category + '":',
      catMemories.length,
      "->",
      kept.length,
    );
  }

  return result;
}

export function reinforceMemory(memory: MemoryEntry): MemoryEntry {
  return {
    ...memory,
    accessCount: memory.accessCount + 1,
    lastAccessed: Date.now(),
    decay: Math.min(1.0, memory.decay + 0.1),
    activationLevel: Math.min(1.0, (memory.activationLevel ?? 0) + 0.2),
  };
}

export function primeMemories(
  memories: MemoryEntry[],
  primedIds: Set<string>,
  activationBoost: number = 0.3,
): MemoryEntry[] {
  return memories.map((m) => {
    if (primedIds.has(m.id)) {
      return {
        ...m,
        activationLevel: Math.min(
          1.0,
          (m.activationLevel ?? 0) + activationBoost,
        ),
      };
    }
    return {
      ...m,
      activationLevel: Math.max(0, (m.activationLevel ?? 0) * 0.9),
    };
  });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
