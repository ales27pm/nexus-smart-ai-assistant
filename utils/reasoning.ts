import {
  ReasoningFrame,
  CognitiveBias,
  Contradiction,
  InferenceStep,
  Analogy,
  Assumption,
  MemoryEntry,
  RetrievalResult,
  SalienceMap,
  SalientEntity,
} from '@/types';

const BIAS_PATTERNS: Array<{
  pattern: RegExp;
  type: CognitiveBias['type'];
  description: string;
  mitigation: string;
}> = [
  { pattern: /\b(everyone knows|obviously|clearly|of course)\b/i, type: 'bandwagon', description: 'Appeal to common belief', mitigation: 'Verify independently' },
  { pattern: /\b(the expert said|studies show)\b/i, type: 'authority', description: 'Over-reliance on authority', mitigation: 'Evaluate the argument on merits' },
  { pattern: /\b(i've always|we've always|traditionally)\b/i, type: 'anchoring', description: 'Anchoring to historical practice', mitigation: 'Consider fresh perspectives' },
  { pattern: /\b(already invested|sunk cost|too late to change)\b/i, type: 'sunk_cost', description: 'Sunk cost fallacy', mitigation: 'Evaluate future value independently' },
  { pattern: /\b(just recently|in the news|viral|trending)\b/i, type: 'availability', description: 'Availability heuristic', mitigation: 'Look for base rates and systematic data' },
  { pattern: /\b(confirms|proves my point|told you|knew it)\b/i, type: 'confirmation', description: 'Confirmation bias', mitigation: 'Seek disconfirming evidence' },
];

const ENTITY_PATTERNS: Array<{ pattern: RegExp; type: SalientEntity['type'] }> = [
  { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, type: 'person' },
  { pattern: /\b(?:Google|Apple|Microsoft|Amazon|Meta|OpenAI|Tesla)\b/gi, type: 'organization' },
  { pattern: /\b(?:AI|ML|API|SDK|CSS|HTML|SQL|REST|React|Python|JavaScript|TypeScript)\b/g, type: 'technology' },
  { pattern: /\$[\d,.]+|\b\d+(?:\.\d+)?%/g, type: 'quantity' },
];

export function detectBiases(userMessage: string, memories: RetrievalResult[]): CognitiveBias[] {
  const biases: CognitiveBias[] = [];
  for (const bp of BIAS_PATTERNS) {
    if (bp.pattern.test(userMessage)) {
      biases.push({ type: bp.type, description: bp.description, severity: 0.6, mitigation: bp.mitigation });
    }
  }
  return biases;
}

export function detectContradictions(userMessage: string, memories: MemoryEntry[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const negationPairs = [
    { pos: /\bi like\b/i, neg: /\bi (?:don't|do not|hate|dislike)\b/i },
    { pos: /\bi want\b/i, neg: /\bi (?:don't|do not) want\b/i },
    { pos: /\bi prefer\b/i, neg: /\bi (?:don't|do not) prefer\b/i },
  ];

  for (const memory of memories.slice(0, 15)) {
    for (const pair of negationPairs) {
      const userPos = pair.pos.test(userMessage);
      const userNeg = pair.neg.test(userMessage);
      const memPos = pair.pos.test(memory.content);
      const memNeg = pair.neg.test(memory.content);

      if ((userPos && memNeg) || (userNeg && memPos)) {
        contradictions.push({
          claim1: userMessage.substring(0, 100),
          claim2: memory.content.substring(0, 100),
          source1: 'current message',
          source2: `memory (${memory.category})`,
          severity: 0.6,
          resolution: 'User may have changed their mind. Acknowledge and update.',
        });
      }
    }
  }
  return contradictions;
}

export function buildInferenceChain(userMessage: string, memories: RetrievalResult[]): InferenceStep[] {
  const chain: InferenceStep[] = [];
  if (memories.length > 0) {
    chain.push({
      premise: `User asks: "${userMessage.substring(0, 60)}"`,
      conclusion: `Relevant: "${memories[0].memory.content.substring(0, 80)}"`,
      confidence: memories[0].score,
      type: 'abductive',
      supportingEvidence: [`Match: ${memories[0].matchType}, Score: ${memories[0].score.toFixed(3)}`],
    });
  }
  return chain;
}

export function buildReasoningFrame(
  userMessage: string,
  memories: MemoryEntry[],
  relevantMemories: RetrievalResult[]
): ReasoningFrame {
  const biases = detectBiases(userMessage, relevantMemories);
  const contradictions = detectContradictions(userMessage, memories);
  const inferenceChain = buildInferenceChain(userMessage, relevantMemories);

  const analogies: Analogy[] = [];
  const analogyMatch = userMessage.match(/\b(?:like|similar to|just as|analogous to)\b.*?(?:\.|$)/gi);
  if (analogyMatch) {
    for (const m of analogyMatch.slice(0, 2)) {
      analogies.push({ source: m.trim(), target: userMessage.substring(0, 60), mapping: 'User analogy', strength: 0.7 });
    }
  }

  const assumptions: Assumption[] = [];
  if (/\b(assuming|assume|presumably|suppose)\b/i.test(userMessage)) {
    assumptions.push({ statement: userMessage.substring(0, 80), implicit: false, confidence: 0.7, risk: 'Verify assumption' });
  }
  if (/\b(best|worst|always|never|everyone|no one)\b/i.test(userMessage)) {
    assumptions.push({ statement: 'Contains absolutes', implicit: true, confidence: 0.4, risk: 'May not hold universally' });
  }

  const confidenceDistribution: Record<string, number> = {};
  for (const step of inferenceChain) {
    confidenceDistribution[step.type] = Math.max(confidenceDistribution[step.type] ?? 0, step.confidence);
  }

  return { biases, contradictions, inferenceChain, analogies, assumptions, confidenceDistribution };
}

export function extractSalience(userMessage: string, memories: MemoryEntry[]): SalienceMap {
  const entities: SalientEntity[] = [];
  const seen = new Set<string>();

  for (const { pattern, type } of ENTITY_PATTERNS) {
    const matches = userMessage.match(pattern) ?? [];
    for (const match of matches) {
      const text = match.trim();
      if (text.length > 1 && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        const isNovel = !memories.some(m => m.content.toLowerCase().includes(text.toLowerCase()));
        entities.push({ text, type, importance: isNovel ? 0.8 : 0.5, isNovel });
      }
    }
  }

  entities.sort((a, b) => b.importance - a.importance);

  const keyActions = [...new Set(
    (userMessage.match(/\b(create|build|fix|analyze|compare|explain|find|search|calculate|generate|write|design|implement)\b/gi) ?? [])
      .map(v => v.toLowerCase())
  )];

  const keyConstraints = (userMessage.match(/\b(must|should|need to|within|before|after|only|except|without)\b[^.!?]*/gi) ?? [])
    .slice(0, 3).map(c => c.trim());

  const emotionalHotspots = (userMessage.match(/\b(i feel|frustrated|anxious|happy|confused|stressed|excited)\b[^.!?]*/gi) ?? [])
    .slice(0, 2).map(p => p.trim());

  const words = userMessage.split(/\s+/).length;
  const informationDensity = Math.min(1, (entities.length / Math.max(words, 1)) * 5);
  const focusPoint = entities.length > 0 ? entities[0].text : keyActions[0] ?? userMessage.substring(0, 40).trim();
  const peripheralContext = entities.slice(1, 4).map(e => e.text);

  return { keyEntities: entities.slice(0, 6), keyActions, keyConstraints, emotionalHotspots, informationDensity, focusPoint, peripheralContext };
}

export function buildReasoningInjection(frame: ReasoningFrame): string {
  const parts: string[] = [];

  if (frame.biases.length > 0) {
    const warnings = frame.biases.slice(0, 2).map(b => `- ${b.type}: ${b.description}. ${b.mitigation}`);
    parts.push(`### Bias Alerts\n${warnings.join('\n')}`);
  }

  if (frame.contradictions.length > 0) {
    parts.push(`### Contradictions\n${frame.contradictions.slice(0, 2).map(c => `- "${c.claim1.substring(0, 50)}" vs "${c.claim2.substring(0, 50)}". ${c.resolution}`).join('\n')}`);
  }

  if (frame.assumptions.filter(a => a.implicit).length > 0) {
    parts.push(`### Assumptions\n${frame.assumptions.filter(a => a.implicit).slice(0, 2).map(a => `- ${a.statement} — ${a.risk}`).join('\n')}`);
  }

  return parts.length > 0 ? '## Reasoning\n' + parts.join('\n\n') : '';
}

export function buildSalienceInjection(salience: SalienceMap): string {
  const parts: string[] = [];
  const novel = salience.keyEntities.filter(e => e.isNovel);
  if (novel.length > 0) parts.push(`New entities: ${novel.map(e => `"${e.text}" (${e.type})`).join(', ')}`);
  if (salience.keyConstraints.length > 0) parts.push(`Constraints: ${salience.keyConstraints.join('; ')}`);
  if (salience.emotionalHotspots.length > 0) parts.push(`Emotional markers: ${salience.emotionalHotspots.join('; ')}`);
  if (salience.informationDensity > 0.7) parts.push(`High density. Focus: "${salience.focusPoint}"`);
  return parts.length > 0 ? '## Salience\n' + parts.join('\n') : '';
}
