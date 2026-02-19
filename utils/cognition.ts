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
} from '@/types';
import { generateText } from '@rork-ai/toolkit-sdk';
import { searchMemories } from '@/utils/memory';

const EMOTION_LEXICON: Record<string, { valence: number; arousal: number; label: string }> = {
  happy: { valence: 0.8, arousal: 0.6, label: 'joy' },
  great: { valence: 0.9, arousal: 0.7, label: 'joy' },
  awesome: { valence: 0.9, arousal: 0.8, label: 'excitement' },
  love: { valence: 0.9, arousal: 0.7, label: 'love' },
  thank: { valence: 0.7, arousal: 0.4, label: 'gratitude' },
  thanks: { valence: 0.7, arousal: 0.4, label: 'gratitude' },
  please: { valence: 0.3, arousal: 0.3, label: 'politeness' },
  excited: { valence: 0.8, arousal: 0.9, label: 'excitement' },
  amazing: { valence: 0.9, arousal: 0.8, label: 'awe' },
  wonderful: { valence: 0.9, arousal: 0.6, label: 'joy' },
  curious: { valence: 0.5, arousal: 0.6, label: 'curiosity' },
  interesting: { valence: 0.6, arousal: 0.5, label: 'interest' },
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
  sorry: { valence: -0.3, arousal: 0.4, label: 'regret' },
  help: { valence: -0.2, arousal: 0.5, label: 'need' },
  urgent: { valence: -0.3, arousal: 0.9, label: 'urgency' },
  asap: { valence: -0.3, arousal: 0.9, label: 'urgency' },
  wrong: { valence: -0.5, arousal: 0.6, label: 'concern' },
  broken: { valence: -0.6, arousal: 0.7, label: 'frustration' },
  stuck: { valence: -0.5, arousal: 0.6, label: 'frustration' },
  cool: { valence: 0.6, arousal: 0.5, label: 'approval' },
  nice: { valence: 0.6, arousal: 0.4, label: 'approval' },
  perfect: { valence: 0.9, arousal: 0.6, label: 'satisfaction' },
  hate: { valence: -0.9, arousal: 0.8, label: 'hatred' },
  terrible: { valence: -0.8, arousal: 0.7, label: 'disgust' },
  awful: { valence: -0.8, arousal: 0.6, label: 'disgust' },
  wow: { valence: 0.7, arousal: 0.8, label: 'surprise' },
  omg: { valence: 0.5, arousal: 0.9, label: 'surprise' },
  lol: { valence: 0.6, arousal: 0.6, label: 'amusement' },
  haha: { valence: 0.6, arousal: 0.6, label: 'amusement' },
};

const STYLE_PATTERNS: Array<{ pattern: RegExp; style: CommunicationStyle; weight: number }> = [
  { pattern: /\b(please|kindly|would you|could you|sir|madam|dear)\b/i, style: 'formal', weight: 0.7 },
  { pattern: /\b(whereas|furthermore|consequently|therefore|thus|hence)\b/i, style: 'formal', weight: 0.9 },
  { pattern: /\b(hey|yo|sup|lol|haha|lmao|bruh|dude|gonna|wanna)\b/i, style: 'casual', weight: 0.8 },
  { pattern: /[!]{2,}|[?]{2,}|\.{3,}/g, style: 'casual', weight: 0.4 },
  { pattern: /\b(api|sdk|function|class|algorithm|database|server|deploy|debug|compile|runtime)\b/i, style: 'technical', weight: 0.8 },
  { pattern: /\b(code|programming|software|framework|library|module|async|sync)\b/i, style: 'technical', weight: 0.6 },
  { pattern: /\b(imagine|create|design|story|poem|write me|make me|dream|vision|art)\b/i, style: 'creative', weight: 0.8 },
  { pattern: /\b(asap|urgent|immediately|right now|hurry|deadline|critical|emergency)\b/i, style: 'urgent', weight: 0.9 },
  { pattern: /\b(think about|consider|reflect|ponder|wonder|what if|meaning|philosophy)\b/i, style: 'reflective', weight: 0.7 },
];

const COMPLEXITY_INDICATORS = {
  simple: [/^(what is|who is|when|where|how old|how many|define|translate)/i, /^.{0,60}$/],
  moderate: [/\b(explain|compare|difference|how does|why does|describe)\b/i, /\b(and|also|plus|additionally)\b/i],
  complex: [/\b(analyze|evaluate|assess|implications|trade-?offs|pros and cons)\b/i, /\b(if.*then|assuming|given that|considering)\b/i],
  expert: [/\b(optimize|architect|design system|scalab|distributed|consensus|theorem)\b/i, /\b(prove|derive|formalize|axiom|contradict)\b/i],
};

export function analyzeEmotion(text: string): EmotionalState {
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
    matchCount > 0 && Math.abs(avgValence) <= 0.2 ? 'mixed' : 'neutral';

  const arousal: EmotionalArousal =
    avgArousal > 0.65 ? 'high' :
    avgArousal > 0.35 ? 'medium' : 'low';

  let dominantEmotion = 'neutral';
  let maxCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  const styleScores = new Map<CommunicationStyle, number>();
  for (const { pattern, style, weight } of STYLE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      const current = styleScores.get(style) ?? 0;
      styleScores.set(style, current + weight * matches.length);
    }
  }

  let detectedStyle: CommunicationStyle = 'casual';
  let maxStyleScore = 0;
  for (const [style, score] of styleScores) {
    if (score > maxStyleScore) {
      maxStyleScore = score;
      detectedStyle = style;
    }
  }

  const confidence = Math.min(1, matchCount * 0.2 + (maxStyleScore > 0 ? 0.2 : 0));

  const empathyLevel = valence === 'negative' ? 0.8 :
    valence === 'mixed' ? 0.6 :
    dominantEmotion === 'confusion' ? 0.7 :
    dominantEmotion === 'curiosity' ? 0.5 : 0.3;

  console.log('[COGNITION] Emotion analysis:', { valence, arousal, dominantEmotion, detectedStyle, confidence: confidence.toFixed(2) });

  return {
    valence,
    arousal,
    dominantEmotion,
    confidence,
    style: detectedStyle,
    empathyLevel,
  };
}

export function assessMetacognition(userMessage: string, conversationLength: number): MetacognitionState {
  const msgLen = userMessage.length;
  const questionMarks = (userMessage.match(/\?/g) ?? []).length;
  const conjunctions = (userMessage.match(/\b(and|but|or|because|however|although|while|whereas)\b/gi) ?? []).length;

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

  if (msgLen > 300 && conjunctions >= 3) {
    const levels = ['simple', 'moderate', 'complex', 'expert'] as const;
    const idx = Math.min(levels.indexOf(complexity) + 1, 3);
    complexity = levels[idx];
  }

  const shouldDecompose = complexity === 'complex' || complexity === 'expert' || msgLen > 400;
  const shouldSeekClarification = (questionMarks === 0 && msgLen < 15) || /\b(it|this|that|those|them)\b/i.test(userMessage) && msgLen < 30;

  const uncertaintyLevel =
    complexity === 'expert' ? 0.6 :
    complexity === 'complex' ? 0.4 :
    complexity === 'moderate' ? 0.2 : 0.1;

  const cognitiveLoad = Math.min(1, (msgLen / 500) * 0.3 + (conjunctions / 5) * 0.3 + (questionMarks / 3) * 0.2 + (conversationLength / 20) * 0.2);

  const confidenceCalibration = 1 - uncertaintyLevel * 0.5;

  console.log('[COGNITION] Metacognition:', { complexity, shouldDecompose, uncertaintyLevel: uncertaintyLevel.toFixed(2), cognitiveLoad: cognitiveLoad.toFixed(2) });

  return {
    uncertaintyLevel,
    reasoningComplexity: complexity,
    shouldDecompose,
    shouldSeekClarification,
    confidenceCalibration,
    cognitiveLoad,
  };
}

export function buildThoughtTree(query: string, memories: RetrievalResult[], metacognition: MetacognitionState): ThoughtTree {
  const branches: ThoughtBranch[] = [];
  let branchId = 0;

  const directBranch: ThoughtBranch = {
    id: `tb_${branchId++}`,
    hypothesis: 'Direct response based on available knowledge',
    reasoning: 'Answer the query directly using known information and retrieved memories',
    confidence: metacognition.confidenceCalibration,
    evidence: memories.slice(0, 3).map(r => r.memory.content.substring(0, 80)),
    counterpoints: [],
    children: [],
    depth: 0,
    pruned: false,
  };
  branches.push(directBranch);

  if (metacognition.shouldDecompose) {
    const decomposeBranch: ThoughtBranch = {
      id: `tb_${branchId++}`,
      hypothesis: 'Decompose into sub-problems for structured analysis',
      reasoning: 'The query is complex enough to benefit from breaking into smaller components',
      confidence: 0.7,
      evidence: ['Query complexity: ' + metacognition.reasoningComplexity, 'Cognitive load: ' + metacognition.cognitiveLoad.toFixed(2)],
      counterpoints: ['May over-complicate a simpler question'],
      children: [],
      depth: 0,
      pruned: false,
    };

    const aspects = extractAspects(query);
    for (const aspect of aspects.slice(0, 4)) {
      decomposeBranch.children.push({
        id: `tb_${branchId++}`,
        hypothesis: `Analyze: ${aspect}`,
        reasoning: `Focus on the "${aspect}" dimension of the problem`,
        confidence: 0.6,
        evidence: [],
        counterpoints: [],
        children: [],
        depth: 1,
        pruned: false,
      });
    }
    branches.push(decomposeBranch);
  }

  if (memories.length > 0) {
    const memoryBranch: ThoughtBranch = {
      id: `tb_${branchId++}`,
      hypothesis: 'Leverage stored knowledge and user context',
      reasoning: 'Relevant memories provide personalized context for a more tailored response',
      confidence: Math.min(0.9, memories[0].score + 0.3),
      evidence: memories.map(r => `[${r.matchType}] ${r.memory.content.substring(0, 60)}`),
      counterpoints: ['Memories may be outdated', 'Context may not fully apply'],
      children: [],
      depth: 0,
      pruned: false,
    };
    branches.push(memoryBranch);
  }

  const hasFactualQuestion = /\b(what|who|when|where|how|why|is|are|was|were|does|did|can|will)\b/i.test(query) && query.includes('?');
  if (hasFactualQuestion) {
    const verifyBranch: ThoughtBranch = {
      id: `tb_${branchId++}`,
      hypothesis: 'Verify factual claims before responding',
      reasoning: 'Factual questions benefit from cross-referencing multiple sources',
      confidence: 0.5,
      evidence: ['Contains factual question markers'],
      counterpoints: ['May slow response for simple facts'],
      children: [],
      depth: 0,
      pruned: false,
    };
    branches.push(verifyBranch);
  }

  branches.sort((a, b) => b.confidence - a.confidence);

  const bestPath = branches
    .filter(b => !b.pruned && b.confidence > 0.4)
    .slice(0, 3)
    .map(b => b.id);

  const convergenceScore = branches.length > 0
    ? branches.reduce((sum, b) => sum + b.confidence, 0) / branches.length
    : 0.5;

  console.log('[COGNITION] Thought tree built:', branches.length, 'branches, convergence:', convergenceScore.toFixed(2));

  return {
    root: query,
    branches,
    bestPath,
    explorationDepth: metacognition.shouldDecompose ? 2 : 1,
    convergenceScore,
  };
}

function extractAspects(query: string): string[] {
  const aspects: string[] = [];
  const sentences = query.split(/[.!?;]+/).filter(s => s.trim().length > 5);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 10) {
      aspects.push(trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed);
    }
  }

  const andParts = query.split(/\b(and|also|plus|additionally|moreover)\b/i);
  for (const part of andParts) {
    const trimmed = part.trim();
    if (trimmed.length > 10 && !aspects.includes(trimmed)) {
      aspects.push(trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed);
    }
  }

  if (aspects.length === 0) {
    aspects.push(query.substring(0, 60));
  }

  return aspects.slice(0, 6);
}

export function detectCuriosity(
  userMessage: string,
  memories: MemoryEntry[],
  emotionalState: EmotionalState
): CuriositySignal[] {
  const signals: CuriositySignal[] = [];

  const conceptPatterns = [
    /\b(?:what|how|why|explain|tell me about)\s+(.{5,60})/gi,
    /\b(?:learn|understand|know)\s+(?:about|more about)\s+(.{5,60})/gi,
    /\b(?:difference between|compare)\s+(.{5,60})/gi,
  ];

  const extractedTopics: string[] = [];
  for (const pattern of conceptPatterns) {
    let match;
    while ((match = pattern.exec(userMessage)) !== null) {
      extractedTopics.push(match[1].trim().replace(/[?.!,]+$/, ''));
    }
  }

  const nounPhrases = userMessage.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
  for (const np of nounPhrases) {
    if (np.length > 3 && !extractedTopics.includes(np)) {
      extractedTopics.push(np);
    }
  }

  for (const topic of extractedTopics.slice(0, 5)) {
    const memoryMatches = searchMemories(memories, topic, { maxResults: 3, minScore: 0.1 });
    const knowledgeGap = memoryMatches.length === 0 ? 0.9 :
      memoryMatches.length === 1 ? 0.6 :
      memoryMatches.length === 2 ? 0.3 : 0.1;

    const isEmotionallyRelevant = emotionalState.dominantEmotion === 'curiosity' || emotionalState.dominantEmotion === 'interest';
    const relevance = isEmotionallyRelevant ? 0.9 : 0.5;
    const explorationPriority = (knowledgeGap * 0.6 + relevance * 0.4);

    const suggestedQuestions = generateCuriosityQuestions(topic, memoryMatches);
    const relatedConcepts = extractRelatedConcepts(topic, memories);

    if (explorationPriority > 0.3) {
      signals.push({
        topic,
        knowledgeGap,
        relevance,
        explorationPriority,
        suggestedQuestions,
        relatedConcepts,
      });
    }
  }

  signals.sort((a, b) => b.explorationPriority - a.explorationPriority);
  console.log('[COGNITION] Curiosity signals:', signals.length, 'topics detected');
  return signals.slice(0, 4);
}

function generateCuriosityQuestions(topic: string, existingKnowledge: RetrievalResult[]): string[] {
  const questions: string[] = [];
  if (existingKnowledge.length === 0) {
    questions.push(`What are the fundamentals of ${topic}?`);
    questions.push(`How does ${topic} relate to the user's interests?`);
  } else {
    questions.push(`What deeper aspects of ${topic} haven't been explored?`);
    questions.push(`Are there recent developments in ${topic}?`);
  }
  questions.push(`What practical applications does ${topic} have?`);
  return questions;
}

function extractRelatedConcepts(topic: string, memories: MemoryEntry[]): string[] {
  const related: string[] = [];
  const topicWords = topic.toLowerCase().split(/\s+/);

  for (const memory of memories.slice(0, 20)) {
    for (const keyword of memory.keywords) {
      const kwLower = keyword.toLowerCase();
      for (const tw of topicWords) {
        if (kwLower.includes(tw) || tw.includes(kwLower)) {
          if (!related.includes(keyword) && keyword.toLowerCase() !== topic.toLowerCase()) {
            related.push(keyword);
          }
        }
      }
    }
  }

  return related.slice(0, 5);
}

export function buildEmotionalMimicry(emotionalState: EmotionalState): string {
  const { valence, arousal, dominantEmotion, style, empathyLevel } = emotionalState;

  let toneDirective = '';

  if (valence === 'negative' && arousal === 'high') {
    toneDirective = `The user appears ${dominantEmotion}. Respond with calm, grounded empathy. Acknowledge their feeling without being patronizing. Be solution-oriented but patient. Avoid excessive positivity or dismissiveness.`;
  } else if (valence === 'negative' && arousal === 'low') {
    toneDirective = `The user seems ${dominantEmotion}. Use warm, gentle language. Offer encouragement naturally without being forced. Keep responses concise but caring.`;
  } else if (valence === 'positive' && arousal === 'high') {
    toneDirective = `The user is ${dominantEmotion}. Match their energy. Be enthusiastic and build on their momentum. Use dynamic, engaging language.`;
  } else if (valence === 'positive' && arousal === 'low') {
    toneDirective = `The user is in a calm, pleasant state. Maintain a warm, steady conversational tone. Be thorough and thoughtful.`;
  } else if (valence === 'mixed') {
    toneDirective = `The user has mixed emotions. Be balanced and nuanced. Acknowledge complexity in their situation. Avoid oversimplifying.`;
  } else {
    toneDirective = `Maintain a helpful, clear, and focused tone.`;
  }

  let styleDirective = '';
  switch (style) {
    case 'formal':
      styleDirective = 'Use professional, structured language. Favor precision over brevity.';
      break;
    case 'casual':
      styleDirective = 'Keep it conversational and natural. Contractions are fine. Be approachable.';
      break;
    case 'technical':
      styleDirective = 'Use precise technical terminology. Include code examples or technical details where relevant. Be systematic.';
      break;
    case 'creative':
      styleDirective = 'Be imaginative and expressive. Use vivid language and creative framing. Think outside the box.';
      break;
    case 'urgent':
      styleDirective = 'Be concise and action-oriented. Lead with the solution. Skip preamble.';
      break;
    case 'reflective':
      styleDirective = 'Be thoughtful and exploratory. Consider multiple angles. Invite deeper thinking.';
      break;
  }

  const empathyDirective = empathyLevel > 0.6
    ? 'Show genuine understanding of their situation. Validate their experience before offering solutions.'
    : '';

  return [toneDirective, styleDirective, empathyDirective].filter(Boolean).join('\n');
}

export function buildCuriosityInjection(signals: CuriositySignal[]): string {
  if (signals.length === 0) return '';

  const parts: string[] = ['## Curiosity & Knowledge Expansion'];

  for (const signal of signals.slice(0, 3)) {
    if (signal.knowledgeGap > 0.5) {
      parts.push(`- Knowledge gap detected for "${signal.topic}" — proactively offer deeper insights or ask if they want to explore further`);
    }
    if (signal.relatedConcepts.length > 0) {
      parts.push(`- Related concepts to weave in naturally: ${signal.relatedConcepts.join(', ')}`);
    }
    if (signal.suggestedQuestions.length > 0) {
      parts.push(`- Consider exploring: ${signal.suggestedQuestions[0]}`);
    }
  }

  return parts.join('\n');
}

export function buildThoughtTreeInjection(tree: ThoughtTree): string {
  if (!tree || tree.branches.length <= 1) return '';

  const parts: string[] = ['## Reasoning Strategy (Tree of Thought)'];
  parts.push(`Convergence: ${(tree.convergenceScore * 100).toFixed(0)}% | Depth: ${tree.explorationDepth}`);

  for (const branch of tree.branches.filter(b => !b.pruned).slice(0, 3)) {
    const evidenceStr = branch.evidence.length > 0 ? ` [Evidence: ${branch.evidence.slice(0, 2).join('; ')}]` : '';
    parts.push(`- Path (${(branch.confidence * 100).toFixed(0)}%): ${branch.hypothesis}${evidenceStr}`);

    if (branch.counterpoints.length > 0) {
      parts.push(`  Caution: ${branch.counterpoints[0]}`);
    }

    for (const child of branch.children.slice(0, 2)) {
      parts.push(`  → Sub-analysis: ${child.hypothesis}`);
    }
  }

  parts.push(`\nRecommended approach: Follow the highest-confidence path while considering counterpoints. If decomposed, address each sub-problem systematically.`);

  return parts.join('\n');
}

export function buildMetacognitionInjection(meta: MetacognitionState): string {
  const parts: string[] = [];

  if (meta.uncertaintyLevel > 0.4) {
    parts.push(`Uncertainty is elevated (${(meta.uncertaintyLevel * 100).toFixed(0)}%). Express calibrated confidence — hedge appropriately on uncertain claims. Distinguish known facts from inferences.`);
  }

  if (meta.shouldDecompose) {
    parts.push(`This query benefits from structured decomposition. Break the response into clear sections addressing each component.`);
  }

  if (meta.shouldSeekClarification) {
    parts.push(`The query may be ambiguous. Consider asking a clarifying question, but still provide a best-guess answer.`);
  }

  if (meta.cognitiveLoad > 0.7) {
    parts.push(`High cognitive load detected. Provide clear structure (headers, numbered lists) to aid comprehension.`);
  }

  return parts.length > 0 ? '## Self-Monitoring\n' + parts.join('\n') : '';
}

export async function runCognitionEngine(
  userMessage: string,
  memories: MemoryEntry[],
  relevantMemories: RetrievalResult[],
  conversationLength: number,
): Promise<CognitionFrame> {
  console.log('[COGNITION] Running cognition engine for:', userMessage.substring(0, 60));

  const emotionalState = analyzeEmotion(userMessage);
  const metacognition = assessMetacognition(userMessage, conversationLength);
  const thoughtTree = buildThoughtTree(userMessage, relevantMemories, metacognition);
  const curiositySignals = detectCuriosity(userMessage, memories, emotionalState);

  const contextInjections: ContextInjection[] = [];

  const emotionContent = buildEmotionalMimicry(emotionalState);
  if (emotionContent) {
    contextInjections.push({
      source: 'emotion',
      content: emotionContent,
      priority: emotionalState.empathyLevel > 0.5 ? 9 : 5,
      tokenCost: estimateTokens(emotionContent),
    });
  }

  const thoughtContent = buildThoughtTreeInjection(thoughtTree);
  if (thoughtContent) {
    contextInjections.push({
      source: 'thought_tree',
      content: thoughtContent,
      priority: metacognition.shouldDecompose ? 8 : 4,
      tokenCost: estimateTokens(thoughtContent),
    });
  }

  const curiosityContent = buildCuriosityInjection(curiositySignals);
  if (curiosityContent) {
    contextInjections.push({
      source: 'curiosity',
      content: curiosityContent,
      priority: curiositySignals.some(s => s.knowledgeGap > 0.5) ? 6 : 3,
      tokenCost: estimateTokens(curiosityContent),
    });
  }

  const metaContent = buildMetacognitionInjection(metacognition);
  if (metaContent) {
    contextInjections.push({
      source: 'meta',
      content: metaContent,
      priority: metacognition.uncertaintyLevel > 0.4 ? 7 : 3,
      tokenCost: estimateTokens(metaContent),
    });
  }

  contextInjections.sort((a, b) => b.priority - a.priority);

  console.log('[COGNITION] Frame built:', {
    emotion: emotionalState.dominantEmotion,
    style: emotionalState.style,
    complexity: metacognition.reasoningComplexity,
    branches: thoughtTree.branches.length,
    curiosity: curiositySignals.length,
    injections: contextInjections.length,
  });

  return {
    emotionalState,
    thoughtTree,
    curiositySignals,
    contextInjections,
    metacognition,
    timestamp: Date.now(),
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
