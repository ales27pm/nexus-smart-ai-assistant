import AsyncStorage from '@react-native-async-storage/async-storage';
import { MemoryEntry, RetrievalResult, MemoryCategory } from '@/types';

const MEMORY_KEY = 'nexus_memory_bank';
const IDF_CACHE_KEY = 'nexus_idf_cache';

export async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const memories = JSON.parse(raw) as MemoryEntry[];
    return memories.map(migrateMemory);
  } catch (e) {
    console.log('[NEXUS] Failed to load memories:', e);
    return [];
  }
}

export async function saveMemories(memories: MemoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
    console.log('[NEXUS] Saved', memories.length, 'memories');
  } catch (e) {
    console.log('[NEXUS] Failed to save memories:', e);
  }
}

function migrateMemory(m: Partial<MemoryEntry> & { id: string; content: string }): MemoryEntry {
  return {
    id: m.id,
    content: m.content,
    keywords: m.keywords ?? [],
    category: (m.category as MemoryCategory) ?? 'context',
    timestamp: m.timestamp ?? Date.now(),
    importance: m.importance ?? 3,
    source: m.source ?? 'conversation',
    accessCount: m.accessCount ?? 0,
    lastAccessed: m.lastAccessed ?? m.timestamp ?? Date.now(),
    embedding: m.embedding,
    relations: m.relations ?? [],
    consolidated: m.consolidated ?? false,
    decay: m.decay ?? 1.0,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildIDF(memories: MemoryEntry[]): Map<string, number> {
  const docCount = memories.length || 1;
  const termDocFreq = new Map<string, number>();

  for (const m of memories) {
    const terms = new Set(tokenize(m.content + ' ' + m.keywords.join(' ')));
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

function computeTFIDF(text: string, idf: Map<string, number>): Map<string, number> {
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

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
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
  const hoursSinceAccess = (Date.now() - memory.lastAccessed) / (1000 * 60 * 60);
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
  }
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
    const docText = m.content + ' ' + m.keywords.join(' ') + ' ' + m.category;
    const docVec = computeTFIDF(docText, idf);

    const tfidfScore = cosineSimilarity(queryVec, docVec);

    const queryTerms = tokenize(query);
    let keywordBonus = 0;
    for (const term of queryTerms) {
      for (const kw of m.keywords) {
        if (kw.toLowerCase().includes(term) || term.includes(kw.toLowerCase())) {
          keywordBonus += 0.15;
        }
      }
    }
    keywordBonus = Math.min(keywordBonus, 0.4);

    const decay = computeDecay(m);
    const recencyScore = decay * recencyBias;
    const importanceScore = (m.importance / 5) * importanceBias;

    const totalScore = tfidfScore + keywordBonus + recencyScore + importanceScore;

    const matchType: RetrievalResult['matchType'] =
      tfidfScore > keywordBonus ? 'semantic' : 'keyword';

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

  console.log('[NEXUS] Memory search for "' + query.substring(0, 40) + '":', selected.length, 'results');
  return selected;
}

export function deduplicateMemories(memories: MemoryEntry[]): MemoryEntry[] {
  if (memories.length < 2) return memories;

  const idf = buildIDF(memories);
  const vectors = memories.map((m) =>
    computeTFIDF(m.content + ' ' + m.keywords.join(' '), idf)
  );

  const toRemove = new Set<number>();

  for (let i = 0; i < memories.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < memories.length; j++) {
      if (toRemove.has(j)) continue;
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim > 0.85) {
        const keepIdx = memories[i].importance >= memories[j].importance ? i : j;
        const removeIdx = keepIdx === i ? j : i;
        toRemove.add(removeIdx);
        console.log('[NEXUS] Dedup: removing memory', memories[removeIdx].id, 'sim=', sim.toFixed(2));
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
    console.log('[NEXUS] Consolidated category "' + category + '":', catMemories.length, '->', kept.length);
  }

  return result;
}

export function reinforceMemory(memory: MemoryEntry): MemoryEntry {
  return {
    ...memory,
    accessCount: memory.accessCount + 1,
    lastAccessed: Date.now(),
    decay: Math.min(1.0, memory.decay + 0.1),
  };
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
