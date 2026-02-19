import AsyncStorage from '@react-native-async-storage/async-storage';
import { MemoryEntry } from '@/types';

const MEMORY_KEY = 'nexus_memory_bank';

export async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MemoryEntry[];
  } catch (e) {
    console.log('[NEXUS] Failed to load memories:', e);
    return [];
  }
}

export async function saveMemories(memories: MemoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  } catch (e) {
    console.log('[NEXUS] Failed to save memories:', e);
  }
}

export function searchMemories(memories: MemoryEntry[], query: string): MemoryEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored = memories.map((m) => {
    let score = 0;
    const content = m.content.toLowerCase();
    const keywordsStr = m.keywords.join(' ').toLowerCase();
    const category = m.category.toLowerCase();

    for (const term of terms) {
      if (content.includes(term)) score += 2;
      if (keywordsStr.includes(term)) score += 3;
      if (category.includes(term)) score += 1;
    }

    score += m.importance * 0.5;
    const age = (Date.now() - m.timestamp) / (1000 * 60 * 60 * 24);
    score -= age * 0.01;

    return { memory: m, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.memory);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
