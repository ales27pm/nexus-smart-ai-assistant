export interface MemoryEntry {
  id: string;
  content: string;
  keywords: string[];
  category: MemoryCategory;
  timestamp: number;
  importance: number;
  source: string;
  accessCount: number;
  lastAccessed: number;
  embedding?: number[];
  relations?: string[];
  consolidated?: boolean;
  decay: number;
}

export type MemoryCategory =
  | 'preference'
  | 'fact'
  | 'instruction'
  | 'context'
  | 'goal'
  | 'persona'
  | 'skill'
  | 'entity'
  | 'episodic';

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
  messageCount: number;
  summary?: string;
  tags?: string[];
}

export interface ToolExecution {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  state: 'pending' | 'running' | 'complete' | 'error';
}

export interface ContextWindow {
  systemPrompt: string;
  memoryContext: string;
  conversationSummary: string;
  recentMessages: unknown[];
  tokenEstimate: number;
}

export interface RetrievalResult {
  memory: MemoryEntry;
  score: number;
  matchType: 'keyword' | 'semantic' | 'temporal' | 'relational';
}

export interface ContextConfig {
  maxTokens: number;
  memorySlots: number;
  recencyBias: number;
  importanceBias: number;
  diversityPenalty: number;
}
