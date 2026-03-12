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
  activationLevel?: number;
  emotionalValence?: number;
  contextSignature?: string;
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
  matchType: 'keyword' | 'semantic' | 'temporal' | 'relational' | 'associative' | 'primed';
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
  emotionalTrajectory?: 'escalating' | 'deescalating' | 'stable' | 'volatile';
  microExpressions?: string[];
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
  intent: IntentClassification;
  timestamp: number;
}

export interface ContextInjection {
  source: 'memory' | 'emotion' | 'curiosity' | 'thought_tree' | 'persona' | 'temporal' | 'meta' | 'intent' | 'priming';
  content: string;
  priority: number;
  tokenCost: number;
}

export interface MetacognitionState {
  uncertaintyLevel: number;
  reasoningComplexity: 'simple' | 'moderate' | 'complex' | 'expert';
  shouldDecompose: boolean;
  shouldSeekClarification: boolean;
  shouldSearchWeb: boolean;
  isTimeSensitive: boolean;
  ambiguityScore: number;
  ambiguityReasons: string[];
  confidenceCalibration: number;
  cognitiveLoad: number;
}

export type IntentType =
  | 'question_factual'
  | 'question_opinion'
  | 'question_how'
  | 'question_why'
  | 'question_comparison'
  | 'request_action'
  | 'request_creation'
  | 'request_analysis'
  | 'request_search'
  | 'request_memory'
  | 'request_calculation'
  | 'statement_fact'
  | 'statement_opinion'
  | 'statement_emotion'
  | 'statement_instruction'
  | 'social_greeting'
  | 'social_farewell'
  | 'social_gratitude'
  | 'social_apology'
  | 'meta_correction'
  | 'meta_clarification'
  | 'meta_feedback'
  | 'exploration_brainstorm'
  | 'exploration_debate'
  | 'exploration_hypothetical';

export interface IntentClassification {
  primary: IntentType;
  secondary: IntentType | null;
  confidence: number;
  requiresAction: boolean;
  requiresKnowledge: boolean;
  requiresCreativity: boolean;
  isMultiIntent: boolean;
  subIntents: IntentType[];
  urgency: number;
  expectedResponseLength: 'brief' | 'moderate' | 'detailed' | 'comprehensive';
}

export interface AssociativeLink {
  sourceId: string;
  targetId: string;
  strength: number;
  type: 'causal' | 'temporal' | 'topical' | 'semantic' | 'contextual';
  createdAt: number;
  reinforcements: number;
}

export interface SpreadingActivation {
  nodeId: string;
  activationLevel: number;
  depth: number;
  path: string[];
}

