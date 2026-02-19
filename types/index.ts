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

export type EmotionalValence = 'positive' | 'negative' | 'neutral' | 'mixed';
export type EmotionalArousal = 'high' | 'medium' | 'low';
export type CommunicationStyle = 'formal' | 'casual' | 'technical' | 'creative' | 'urgent' | 'reflective';

export interface EmotionalState {
  valence: EmotionalValence;
  arousal: EmotionalArousal;
  dominantEmotion: string;
  confidence: number;
  style: CommunicationStyle;
  empathyLevel: number;
}

export interface ThoughtBranch {
  id: string;
  hypothesis: string;
  reasoning: string;
  confidence: number;
  evidence: string[];
  counterpoints: string[];
  children: ThoughtBranch[];
  depth: number;
  pruned: boolean;
}

export interface ThoughtTree {
  root: string;
  branches: ThoughtBranch[];
  bestPath: string[];
  explorationDepth: number;
  convergenceScore: number;
}

export interface CuriositySignal {
  topic: string;
  knowledgeGap: number;
  relevance: number;
  explorationPriority: number;
  suggestedQuestions: string[];
  relatedConcepts: string[];
}

export interface CognitionFrame {
  emotionalState: EmotionalState;
  thoughtTree: ThoughtTree | null;
  curiositySignals: CuriositySignal[];
  contextInjections: ContextInjection[];
  metacognition: MetacognitionState;
  timestamp: number;
}

export interface ContextInjection {
  source: 'memory' | 'emotion' | 'curiosity' | 'thought_tree' | 'persona' | 'temporal' | 'meta';
  content: string;
  priority: number;
  tokenCost: number;
}

export interface MetacognitionState {
  uncertaintyLevel: number;
  reasoningComplexity: 'simple' | 'moderate' | 'complex' | 'expert';
  shouldDecompose: boolean;
  shouldSeekClarification: boolean;
  confidenceCalibration: number;
  cognitiveLoad: number;
}
