import {
  EmotionalState,
  EmotionalValence,
  EmotionalArousal,
  CommunicationStyle,
  ThoughtBranch,
  ThoughtTree,
  CuriositySignal,
  CognitionFrame,
  ContextInjection,
  MetacognitionState,
  MemoryEntry,
  RetrievalResult,
  IntentClassification,
  DiscourseState,
  ReasoningFrame,
  SalienceMap,
} from '@/types';
import { searchMemories, loadAssociativeLinks, getAssociativeMemories } from '@/utils/memory';
import { classifyIntent, buildIntentInjection } from '@/utils/intent';
import { analyzeDiscourse, buildDiscourseInjection } from '@/utils/discourse';
import { buildReasoningFrame, extractSalience, buildReasoningInjection, buildSalienceInjection } from '@/utils/reasoning';

const EMOTION_LEXICON: Record<string, { valence: number; arousal: number; label: string }> = {
  happy: { valence: 0.8, arousal: 0.6, label: 'joy' },
  great: { valence: 0.9, arousal: 0.7, label: 'joy' },
  awesome: { valence: 0.9, arousal: 0.8, label: 'excitement' },
  love: { valence: 0.9, arousal: 0.7, label: 'love' },
  thank: { valence: 0.7, arousal: 0.4, label: 'gratitude' },
  thanks: { valence: 0.7, arousal: 0.4, label: 'gratitude' },
  excited: { valence: 0.8, arousal: 0.9, label: 'excitement' },
  amazing: { valence: 0.9, arousal: 0.8, label: 'awe' },
  curious: { valence: 0.5, arousal: 0.6, label: 'curiosity' },
  interesting: { valence: 0.6, arousal: 0.5, label: 'interest' },
  proud: { valence: 0.8, arousal: 0.6, label: 'pride' },
  hopeful: { valence: 0.6, arousal: 0.5, label: 'hope' },
  frustrated: { valence: -0.7, arousal: 0.8, label: 'frustration' },
  angry: { valence: -0.9, arousal: 0.9, label: 'anger' },
  annoyed: { valence: -0.6, arousal: 0.6, label: 'annoyance' },
  sad: { valence: -0.7, arousal: 0.3, label: 'sadness' },
  confused: { valence: -0.3, arousal: 0.5, label: 'confusion' },
  worried: { valence: -0.5, arousal: 0.6, label: 'anxiety' },
  anxious: { valence: -0.6, arousal: 0.8, label: 'anxiety' },
  stressed: { valence: -0.7, arousal: 0.8, label: 'stress' },
  tired: { valence: -0.3, arousal: 0.2, label: 'fatigue' },
  bored: { valence: -0.3, arousal: 0.2, label: 'boredom' },
  scared: { valence: -0.7, arousal: 0.9, label: 'fear' },
  disappointed: { valence: -0.6, arousal: 0.4, label: 'disappointment' },
  overwhelmed: { valence: -0.5, arousal: 0.8, label: 'overwhelm' },
  help: { valence: -0.2, arousal: 0.5, label: 'need' },
  urgent: { valence: -0.3, arousal: 0.9, label: 'urgency' },
  wrong: { valence: -0.5, arousal: 0.6, label: 'concern' },
  stuck: { valence: -0.5, arousal: 0.6, label: 'frustration' },
  perfect: { valence: 0.9, arousal: 0.6, label: 'satisfaction' },
  hate: { valence: -0.9, arousal: 0.8, label: 'hatred' },
  terrible: { valence: -0.8, arousal: 0.7, label: 'disgust' },
  wow: { valence: 0.7, arousal: 0.8, label: 'surprise' },
  lol: { valence: 0.6, arousal: 0.6, label: 'amusement' },
  brilliant: { valence: 0.9, arousal: 0.7, label: 'admiration' },
  struggling: { valence: -0.6, arousal: 0.6, label: 'struggle' },
};

const STYLE_PATTERNS: Array<{ pattern: RegExp; style: CommunicationStyle; weight: number }> = [
  { pattern: /\b(please|kindly|would you|could you)\b/i, style: 'formal', weight: 0.7 },
  { pattern: /\b(whereas|furthermore|consequently|therefore|moreover)\b/i, style: 'formal', weight: 0.9 },
  { pattern: /\b(hey|yo|lol|haha|bruh|dude|gonna|wanna|nah|yep)\b/i, style: 'casual', weight: 0.8 },
  { pattern: /\b(api|sdk|function|class|algorithm|database|server|deploy|debug)\b/i, style: 'technical', weight: 0.8 },
  { pattern: /\b(imagine|create|design|story|poem|write me|dream|art)\b/i, style: 'creative', weight: 0.8 },
  { pattern: /\b(asap|urgent|immediately|right now|hurry|critical)\b/i, style: 'urgent', weight: 0.9 },
  { pattern: /\b(think about|consider|reflect|ponder|wonder|what if)\b/i, style: 'reflective', weight: 0.7 },
];

const COMPLEXITY_INDICATORS = {
  simple: [/^(what is|who is|when|where|how old|define)/i, /^.{0,60}$/],
  moderate: [/\b(explain|compare|difference|how does|why does)\b/i],
  complex: [/\b(analyze|evaluate|implications|trade-?offs|pros and cons)\b/i],
  expert: [/\b(optimize|architect|design system|distributed|consensus)\b/i],
};

export function analyzeEmotion(text: string, previousEmotion?: EmotionalState): EmotionalState {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  let totalValence = 0;
  let totalArousal = 0;
  let matchCount = 0;
  const emotionCounts = new Map<string, number>();

  for (const word of words) {
    const entry = EMOTION_LEXICON[word];
    if (entry) {
      totalValence += entry.valence;
      totalArousal += entry.arousal;
      matchCount++;
      emotionCounts.set(entry.label, (emotionCounts.get(entry.label) ?? 0) + 1);
    }
  }

  const punctuationIntensity = (text.match(/[!?]{2,}/g)?.length ?? 0) * 0.15;
  const capsRatio = text.replace(/[^A-Za-z]/g, '').length > 0
    ? text.replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length
    : 0;
  const capsBoost = capsRatio > 0.5 ? 0.3 : 0;

  const avgValence = matchCount > 0 ? totalValence / matchCount : 0;
  const avgArousal = matchCount > 0
    ? Math.min(1, (totalArousal / matchCount) + punctuationIntensity + capsBoost)
    : 0.3 + punctuationIntensity + capsBoost;

  const valence: EmotionalValence =
    avgValence > 0.2 ? 'positive' :
    avgValence < -0.2 ? 'negative' :
    matchCount > 0 ? 'mixed' : 'neutral';

  const arousal: EmotionalArousal =
    avgArousal > 0.65 ? 'high' :
    avgArousal > 0.35 ? 'medium' : 'low';

  let dominantEmotion = 'neutral';
  let maxCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxCount) { maxCount = count; dominantEmotion = emotion; }
  }

  const styleScores = new Map<CommunicationStyle, number>();
  for (const { pattern, style, weight } of STYLE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      styleScores.set(style, (styleScores.get(style) ?? 0) + weight * matches.length);
    }
  }

  let detectedStyle: CommunicationStyle = 'casual';
  let maxStyleScore = 0;
  for (const [style, score] of styleScores) {
    if (score > maxStyleScore) { maxStyleScore = score; detectedStyle = style; }
  }

  const confidence = Math.min(1, matchCount * 0.2 + (maxStyleScore > 0 ? 0.2 : 0));
  const empathyLevel = valence === 'negative' ? 0.8 : valence === 'mixed' ? 0.6 : 0.3;

  let emotionalTrajectory: EmotionalState['emotionalTrajectory'] = 'stable';
  if (previousEmotion) {
    const prevVal = previousEmotion.valence === 'positive' ? 1 : previousEmotion.valence === 'negative' ? -1 : 0;
    const currVal = valence === 'positive' ? 1 : valence === 'negative' ? -1 : 0;
    if (currVal - prevVal > 0) emotionalTrajectory = 'deescalating';
    else if (currVal - prevVal < 0) emotionalTrajectory = 'escalating';
  }

  console.log('[COGNITION] Emotion:', { valence, arousal, dominantEmotion, detectedStyle });

  return {
    valence, arousal, dominantEmotion, confidence,
    style: detectedStyle, empathyLevel, emotionalTrajectory, microExpressions: [],
  };
}

export function assessMetacognition(userMessage: string, conversationLength: number): MetacognitionState {
  const msgLen = userMessage.length;
  const questionMarks = (userMessage.match(/\?/g) ?? []).length;
  const conjunctions = (userMessage.match(/\b(and|but|or|because|however)\b/gi) ?? []).length;

  let complexity: MetacognitionState['reasoningComplexity'] = 'simple';
  for (const [level, patterns] of Object.entries(COMPLEXITY_INDICATORS) as Array<[MetacognitionState['reasoningComplexity'], RegExp[]]>) {
    for (const pat of patterns) {
      if (pat.test(userMessage)) {
        const levels = ['simple', 'moderate', 'complex', 'expert'] as const;
        const currentIdx = levels.indexOf(complexity);
        const newIdx = levels.indexOf(level);
        if (newIdx > currentIdx) complexity = level;
      }
    }
  }

  const shouldDecompose = complexity === 'complex' || complexity === 'expert' || msgLen > 400;

  let ambiguityScore = 0;
  const ambiguityReasons: string[] = [];
  if (/^(it|this|that|these|those|they)\b/i.test(userMessage)) {
    ambiguityScore = 0.8; ambiguityReasons.push('starts with pronoun');
  }
  if (/^\w{1,8}[.!?]?$/i.test(userMessage)) {
    ambiguityScore = Math.max(ambiguityScore, 0.7); ambiguityReasons.push('very short');
  }
  if (/^(do it|fix it|change it|make it|help)$/i.test(userMessage)) {
    ambiguityScore = 0.9; ambiguityReasons.push('imperative without object');
  }
  if (conversationLength === 0 && /\b(it|this|that)\b/i.test(userMessage)) {
    ambiguityScore = Math.max(ambiguityScore, 0.85); ambiguityReasons.push('no prior context');
  }

  const shouldSeekClarification = ambiguityScore >= 0.6;
  const isTimeSensitive = /\b(today|tonight|this week|latest|recent|news|price|weather|2024|2025|2026)\b/i.test(userMessage);
  const hitsKnowledgeLimit = /\b(my company|my team|real-?time|live|current|up-?to-?date)\b/i.test(userMessage);
  const shouldSearchWeb = isTimeSensitive || hitsKnowledgeLimit;

  let uncertaintyLevel = complexity === 'expert' ? 0.6 : complexity === 'complex' ? 0.4 : 0.1;
  if (isTimeSensitive) uncertaintyLevel = Math.min(1, uncertaintyLevel + 0.25);
  if (hitsKnowledgeLimit) uncertaintyLevel = Math.min(1, uncertaintyLevel + 0.2);

  const cognitiveLoad = Math.min(1, (msgLen / 500) * 0.3 + (conjunctions / 5) * 0.3 + (questionMarks / 3) * 0.2);
  const confidenceCalibration = 1 - uncertaintyLevel * 0.5;

  console.log('[COGNITION] Meta:', { complexity, shouldDecompose, shouldSeekClarification, shouldSearchWeb });

  return {
    uncertaintyLevel, reasoningComplexity: complexity, shouldDecompose,
    shouldSeekClarification, shouldSearchWeb, isTimeSensitive,
    ambiguityScore, ambiguityReasons, confidenceCalibration, cognitiveLoad,
  };
}

export function buildThoughtTree(query: string, memories: RetrievalResult[], metacognition: MetacognitionState): ThoughtTree {
  const branches: ThoughtBranch[] = [];
  let branchId = 0;

  branches.push({
    id: `tb_${branchId++}`, hypothesis: 'Direct response based on available knowledge',
    reasoning: 'Answer directly using known information', confidence: metacognition.confidenceCalibration,
    evidence: memories.slice(0, 3).map(r => r.memory.content.substring(0, 80)),
    counterpoints: [], children: [], depth: 0, pruned: false,
  });

  if (metacognition.shouldDecompose) {
    branches.push({
      id: `tb_${branchId++}`, hypothesis: 'Decompose into sub-problems',
      reasoning: 'Complex query benefits from structured breakdown', confidence: 0.7,
      evidence: ['Complexity: ' + metacognition.reasoningComplexity],
      counterpoints: ['May over-complicate'], children: [], depth: 0, pruned: false,
    });
  }

  if (memories.length > 0) {
    branches.push({
      id: `tb_${branchId++}`, hypothesis: 'Leverage stored knowledge',
      reasoning: 'Relevant memories provide personalized context', confidence: Math.min(0.9, memories[0].score + 0.3),
      evidence: memories.map(r => `[${r.matchType}] ${r.memory.content.substring(0, 60)}`),
      counterpoints: ['Memories may be outdated'], children: [], depth: 0, pruned: false,
    });
  }

  branches.sort((a, b) => b.confidence - a.confidence);
  const bestPath = branches.filter(b => !b.pruned && b.confidence > 0.4).slice(0, 3).map(b => b.id);
  const convergenceScore = branches.length > 0 ? branches.reduce((s, b) => s + b.confidence, 0) / branches.length : 0.5;

  return { root: query, branches, bestPath, explorationDepth: metacognition.shouldDecompose ? 2 : 1, convergenceScore };
}

export function detectCuriosity(userMessage: string, memories: MemoryEntry[], emotionalState: EmotionalState): CuriositySignal[] {
  const signals: CuriositySignal[] = [];
  const topics: string[] = [];

  const conceptMatch = userMessage.match(/\b(?:what|how|why|explain|tell me about)\s+(.{5,60})/gi);
  if (conceptMatch) {
    for (const m of conceptMatch) {
      const extracted = m.replace(/^(what|how|why|explain|tell me about)\s+/i, '').trim().replace(/[?.!,]+$/, '');
      if (extracted.length > 3) topics.push(extracted);
    }
  }

  for (const topic of topics.slice(0, 3)) {
    const memoryMatches = searchMemories(memories, topic, { maxResults: 3, minScore: 0.1 });
    const knowledgeGap = memoryMatches.length === 0 ? 0.9 : memoryMatches.length < 2 ? 0.6 : 0.2;
    const relevance = emotionalState.dominantEmotion === 'curiosity' ? 0.9 : 0.5;
    const explorationPriority = knowledgeGap * 0.6 + relevance * 0.4;

    if (explorationPriority > 0.3) {
      signals.push({
        topic, knowledgeGap, relevance, explorationPriority,
        suggestedQuestions: [`What are the key aspects of ${topic}?`],
        relatedConcepts: [],
      });
    }
  }

  signals.sort((a, b) => b.explorationPriority - a.explorationPriority);
  return signals.slice(0, 3);
}

export function buildEmotionalMimicry(emotionalState: EmotionalState): string {
  const { valence, arousal, dominantEmotion, style, empathyLevel, emotionalTrajectory } = emotionalState;
  const parts: string[] = [];

  if (valence === 'negative' && arousal === 'high') {
    parts.push(`User appears ${dominantEmotion}. Respond with calm empathy. Be solution-oriented but patient.`);
  } else if (valence === 'negative') {
    parts.push(`User seems ${dominantEmotion}. Use warm, gentle language. Keep responses caring.`);
  } else if (valence === 'positive' && arousal === 'high') {
    parts.push(`User is ${dominantEmotion}. Match their energy. Be enthusiastic.`);
  } else if (valence === 'mixed') {
    parts.push(`Mixed emotions. Be balanced and nuanced.`);
  }

  const styleMap: Record<string, string> = {
    formal: 'Use professional, structured language.',
    casual: 'Keep it conversational and natural.',
    technical: 'Use precise technical terminology.',
    creative: 'Be imaginative and expressive.',
    urgent: 'Be concise and action-oriented. Lead with the solution.',
    reflective: 'Be thoughtful and exploratory.',
  };
  if (styleMap[style]) parts.push(styleMap[style]);

  if (empathyLevel > 0.6) parts.push('Validate their experience before offering solutions.');
  if (emotionalTrajectory === 'escalating') parts.push('De-escalate with calm, validating language.');

  return parts.join('\n');
}

export function buildCuriosityInjection(signals: CuriositySignal[]): string {
  if (signals.length === 0) return '';
  const parts = ['## Curiosity & Knowledge Expansion'];
  for (const s of signals.slice(0, 2)) {
    if (s.knowledgeGap > 0.5) parts.push(`- Knowledge gap for "${s.topic}" — offer deeper insights`);
  }
  return parts.join('\n');
}

export function buildThoughtTreeInjection(tree: ThoughtTree): string {
  if (!tree || tree.branches.length <= 1) return '';
  const parts = [`## Reasoning Strategy\nConvergence: ${(tree.convergenceScore * 100).toFixed(0)}%`];
  for (const b of tree.branches.filter(b => !b.pruned).slice(0, 3)) {
    parts.push(`- (${(b.confidence * 100).toFixed(0)}%) ${b.hypothesis}`);
  }
  return parts.join('\n');
}

export function buildMetacognitionInjection(meta: MetacognitionState): string {
  const parts: string[] = [];
  if (meta.uncertaintyLevel > 0.4) parts.push(`Uncertainty elevated (${(meta.uncertaintyLevel * 100).toFixed(0)}%). Hedge appropriately.`);
  if (meta.shouldDecompose) parts.push(`Break response into clear sections.`);
  if (meta.shouldSeekClarification) parts.push(`IMPORTANT: Query is ambiguous. Ask clarification via askClarification tool.`);
  if (meta.shouldSearchWeb) parts.push(`Use webSearch BEFORE answering.${meta.isTimeSensitive ? ' Time-sensitive topic.' : ''}`);
  if (meta.cognitiveLoad > 0.7) parts.push(`High cognitive load. Use clear structure.`);
  return parts.length > 0 ? '## Self-Monitoring\n' + parts.join('\n') : '';
}

let _previousEmotion: EmotionalState | undefined;
let _previousDiscourse: DiscourseState | null = null;

export async function runCognitionEngine(
  userMessage: string,
  memories: MemoryEntry[],
  relevantMemories: RetrievalResult[],
  conversationLength: number,
  recentMessages?: unknown[],
): Promise<CognitionFrame> {
  console.log('[COGNITION] Running pipeline for:', userMessage.substring(0, 60));

  const emotionalState = analyzeEmotion(userMessage, _previousEmotion);
  _previousEmotion = emotionalState;

  const metacognition = assessMetacognition(userMessage, conversationLength);
  const thoughtTree = buildThoughtTree(userMessage, relevantMemories, metacognition);
  const curiositySignals = detectCuriosity(userMessage, memories, emotionalState);
  const intent = classifyIntent(userMessage, conversationLength);
  const discourse = analyzeDiscourse(userMessage, recentMessages ?? [], _previousDiscourse);
  _previousDiscourse = discourse;

  const reasoning = buildReasoningFrame(userMessage, memories, relevantMemories);
  const salience = extractSalience(userMessage, memories);

  let associativeMemories: RetrievalResult[] = [];
  try {
    const links = await loadAssociativeLinks();
    if (links.length > 0) {
      associativeMemories = getAssociativeMemories(userMessage, memories, links, relevantMemories);
    }
  } catch (e) {
    console.log('[COGNITION] Associative error:', e);
  }

  const contextInjections: ContextInjection[] = [];
  const addInjection = (source: ContextInjection['source'], content: string, priority: number) => {
    if (content) contextInjections.push({ source, content, priority, tokenCost: Math.ceil(content.length / 3.5) });
  };

  addInjection('emotion', buildEmotionalMimicry(emotionalState), emotionalState.empathyLevel > 0.5 ? 9 : 5);
  addInjection('thought_tree', buildThoughtTreeInjection(thoughtTree), metacognition.shouldDecompose ? 8 : 4);
  addInjection('curiosity', buildCuriosityInjection(curiositySignals), 5);
  addInjection('meta', buildMetacognitionInjection(metacognition), metacognition.uncertaintyLevel > 0.4 ? 7 : 3);
  addInjection('intent', buildIntentInjection(intent), intent.urgency > 0.6 ? 8 : 4);
  addInjection('discourse', buildDiscourseInjection(discourse), discourse.userSatisfaction < 0.4 ? 9 : 3);
  addInjection('reasoning', buildReasoningInjection(reasoning), reasoning.contradictions.length > 0 ? 8 : 3);
  addInjection('salience', buildSalienceInjection(salience), salience.informationDensity > 0.7 ? 7 : 4);

  if (associativeMemories.length > 0) {
    const content = '## Associative Memory\n' + associativeMemories.map(r => `- [${r.matchType}] ${r.memory.content.substring(0, 80)}`).join('\n');
    addInjection('priming', content, 5);
  }

  contextInjections.sort((a, b) => b.priority - a.priority);

  console.log('[COGNITION] Frame built:', {
    emotion: emotionalState.dominantEmotion, intent: intent.primary,
    complexity: metacognition.reasoningComplexity, injections: contextInjections.length,
  });

  return {
    emotionalState, thoughtTree, curiositySignals, contextInjections, metacognition,
    intent, discourse, reasoning, salience, timestamp: Date.now(),
  };
}
