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
  {
    pattern: /\b(everyone knows|obviously|clearly|of course|it's common knowledge)\b/i,
    type: 'bandwagon',
    description: 'Appeal to common belief without evidence',
    mitigation: 'Verify the claim independently rather than relying on perceived consensus',
  },
  {
    pattern: /\b(the expert said|according to|the professor|the doctor|studies show)\b/i,
    type: 'authority',
    description: 'Potential over-reliance on authority without examining the argument',
    mitigation: 'Evaluate the argument on its merits, not just the source authority',
  },
  {
    pattern: /\b(i've always|we've always|traditionally|that's how it's done)\b/i,
    type: 'anchoring',
    description: 'Anchoring to historical practice or first impression',
    mitigation: 'Consider fresh perspectives and evaluate current conditions independently',
  },
  {
    pattern: /\b(i already invested|i've spent|sunk cost|too late to change|come this far)\b/i,
    type: 'sunk_cost',
    description: 'Sunk cost fallacy — continuing because of prior investment',
    mitigation: 'Evaluate future value independently of past investment',
  },
  {
    pattern: /\b(just recently|in the news|viral|trending|heard about)\b/i,
    type: 'availability',
    description: 'Availability heuristic — recent/vivid information overweighted',
    mitigation: 'Look for base rates and systematic data, not just salient examples',
  },
  {
    pattern: /\b(confirms|proves my point|see\?|told you|exactly what i thought|knew it)\b/i,
    type: 'confirmation',
    description: 'Confirmation bias — seeking evidence that supports existing beliefs',
    mitigation: 'Actively seek disconfirming evidence and consider alternative explanations',
  },
  {
    pattern: /\b(it depends on how you look|spin|framing|the way you put it|if you think of it as)\b/i,
    type: 'framing',
    description: 'Framing effect — conclusion depends on how information is presented',
    mitigation: 'Reframe the problem from multiple angles before drawing conclusions',
  },
];

const ENTITY_PATTERNS: Array<{ pattern: RegExp; type: SalientEntity['type'] }> = [
  { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, type: 'person' },
  { pattern: /\b(?:Google|Apple|Microsoft|Amazon|Meta|OpenAI|Tesla|Netflix|Spotify|Twitter|GitHub)\b/gi, type: 'organization' },
  { pattern: /\b(?:AI|ML|API|SDK|CSS|HTML|SQL|REST|GraphQL|Docker|Kubernetes|React|Python|JavaScript|TypeScript)\b/g, type: 'technology' },
  { pattern: /\b\d{4}(?:\s|$)/g, type: 'time' },
  { pattern: /\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:,\d{3})+\b/g, type: 'quantity' },
  { pattern: /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi, type: 'time' },
];

const ASSUMPTION_PATTERNS = [
  { pattern: /\b(assuming|assume|presumably|suppose|if we consider)\b/i, implicit: false },
  { pattern: /\b(should|must|need to|have to|ought to)\b/i, implicit: true },
  { pattern: /\b(best|worst|always|never|everyone|no one|all|none)\b/i, implicit: true },
];

const ANALOGY_PATTERNS = [
  /\b(?:like|similar to|just as|the same way|analogous to|reminds me of|think of it as)\b.*?(?:\.|$)/gi,
  /\b(?:is (?:the|a) .{5,30} of .{5,30})\b/gi,
];

export function detectBiases(userMessage: string, memories: RetrievalResult[]): CognitiveBias[] {
  const biases: CognitiveBias[] = [];

  for (const bp of BIAS_PATTERNS) {
    if (bp.pattern.test(userMessage)) {
      const severity = 0.5 + Math.random() * 0.3;
      biases.push({
        type: bp.type,
        description: bp.description,
        severity,
        mitigation: bp.mitigation,
      });
    }
  }

  if (memories.length > 0) {
    const recentMemories = memories.filter(r => {
      const hoursSince = (Date.now() - r.memory.timestamp) / (1000 * 60 * 60);
      return hoursSince < 24;
    });
    if (recentMemories.length > memories.length * 0.7) {
      biases.push({
        type: 'recency',
        description: 'Most retrieved memories are very recent — older relevant knowledge may be overlooked',
        severity: 0.4,
        mitigation: 'Explicitly search for older memories on this topic for a more balanced perspective',
      });
    }
  }

  console.log('[REASONING] Biases detected:', biases.length);
  return biases;
}

export function detectContradictions(
  userMessage: string,
  memories: MemoryEntry[],
  currentClaims: string[]
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  const negationPairs = [
    { pos: /\bi like\b/i, neg: /\bi (?:don't|do not|hate|dislike) like\b/i },
    { pos: /\bi want\b/i, neg: /\bi (?:don't|do not) want\b/i },
    { pos: /\bi prefer\b/i, neg: /\bi (?:don't|do not) prefer\b/i },
    { pos: /\bi'm (?:a|an)\b/i, neg: /\bi'm not (?:a|an)\b/i },
  ];

  for (const memory of memories.slice(0, 20)) {
    for (const pair of negationPairs) {
      const userHasPos = pair.pos.test(userMessage);
      const userHasNeg = pair.neg.test(userMessage);
      const memHasPos = pair.pos.test(memory.content);
      const memHasNeg = pair.neg.test(memory.content);

      if ((userHasPos && memHasNeg) || (userHasNeg && memHasPos)) {
        contradictions.push({
          claim1: userMessage.substring(0, 100),
          claim2: memory.content.substring(0, 100),
          source1: 'current message',
          source2: `memory (${memory.category})`,
          severity: 0.6,
          resolution: 'User may have changed their mind. Acknowledge the shift and update stored preference.',
        });
      }
    }
  }

  console.log('[REASONING] Contradictions found:', contradictions.length);
  return contradictions;
}

export function buildInferenceChain(
  userMessage: string,
  memories: RetrievalResult[]
): InferenceStep[] {
  const chain: InferenceStep[] = [];

  if (memories.length > 0) {
    const topMemory = memories[0];
    chain.push({
      premise: `User asks about: "${userMessage.substring(0, 60)}"`,
      conclusion: `Most relevant stored knowledge: "${topMemory.memory.content.substring(0, 80)}"`,
      confidence: topMemory.score,
      type: 'abductive',
      supportingEvidence: [
        `Match type: ${topMemory.matchType}`,
        `Score: ${topMemory.score.toFixed(3)}`,
        `Category: ${topMemory.memory.category}`,
      ],
    });
  }

  const hasConditional = /\b(if|when|assuming|given that|provided|unless)\b/i.test(userMessage);
  if (hasConditional) {
    const conditionalMatch = userMessage.match(/\b(?:if|when|assuming|given that)\s+(.{10,80})(?:,|then|\?)/i);
    if (conditionalMatch) {
      chain.push({
        premise: conditionalMatch[1].trim(),
        conclusion: 'Conditional reasoning required — evaluate both branches',
        confidence: 0.6,
        type: 'deductive',
        supportingEvidence: ['Conditional structure detected in query'],
      });
    }
  }

  const hasGeneralization = /\b(all|every|always|never|no one|everyone|most|typically|generally)\b/i.test(userMessage);
  if (hasGeneralization) {
    chain.push({
      premise: 'Query contains generalizations',
      conclusion: 'Verify with specific evidence; avoid confirming overly broad claims',
      confidence: 0.5,
      type: 'inductive',
      supportingEvidence: ['Generalization markers detected — risk of hasty generalization'],
    });
  }

  return chain;
}

export function detectAnalogies(userMessage: string): Analogy[] {
  const analogies: Analogy[] = [];

  for (const pattern of ANALOGY_PATTERNS) {
    const matches = userMessage.match(pattern) ?? [];
    for (const match of matches) {
      analogies.push({
        source: match.trim(),
        target: userMessage.substring(0, 60),
        mapping: 'User-provided analogy — leverage it in response',
        strength: 0.7,
      });
    }
  }

  return analogies;
}

export function extractAssumptions(userMessage: string): Assumption[] {
  const assumptions: Assumption[] = [];

  for (const ap of ASSUMPTION_PATTERNS) {
    const matches = userMessage.match(ap.pattern);
    if (matches) {
      for (const match of matches) {
        const context = userMessage.substring(
          Math.max(0, userMessage.indexOf(match) - 20),
          Math.min(userMessage.length, userMessage.indexOf(match) + match.length + 40)
        ).trim();

        assumptions.push({
          statement: context,
          implicit: ap.implicit,
          confidence: ap.implicit ? 0.4 : 0.7,
          risk: ap.implicit
            ? 'Implicit assumption may not hold — consider surfacing it'
            : 'Explicit assumption stated — verify if valid',
        });
      }
    }
  }

  return assumptions.slice(0, 5);
}

export function buildReasoningFrame(
  userMessage: string,
  memories: MemoryEntry[],
  relevantMemories: RetrievalResult[]
): ReasoningFrame {
  const biases = detectBiases(userMessage, relevantMemories);
  const contradictions = detectContradictions(userMessage, memories, []);
  const inferenceChain = buildInferenceChain(userMessage, relevantMemories);
  const analogies = detectAnalogies(userMessage);
  const assumptions = extractAssumptions(userMessage);

  const confidenceDistribution: Record<string, number> = {};
  for (const step of inferenceChain) {
    confidenceDistribution[step.type] = Math.max(
      confidenceDistribution[step.type] ?? 0,
      step.confidence
    );
  }

  console.log('[REASONING] Frame built:', {
    biases: biases.length,
    contradictions: contradictions.length,
    inferences: inferenceChain.length,
    analogies: analogies.length,
    assumptions: assumptions.length,
  });

  return {
    biases,
    contradictions,
    inferenceChain,
    analogies,
    assumptions,
    confidenceDistribution,
  };
}

export function extractSalience(userMessage: string, memories: MemoryEntry[]): SalienceMap {
  const entities: SalientEntity[] = [];
  const seenTexts = new Set<string>();

  for (const { pattern, type } of ENTITY_PATTERNS) {
    const matches = userMessage.match(pattern) ?? [];
    for (const match of matches) {
      const text = match.trim();
      if (text.length > 1 && !seenTexts.has(text.toLowerCase())) {
        seenTexts.add(text.toLowerCase());

        const isNovel = !memories.some(m =>
          m.content.toLowerCase().includes(text.toLowerCase()) ||
          m.keywords.some(k => k.toLowerCase().includes(text.toLowerCase()))
        );

        entities.push({
          text,
          type,
          importance: isNovel ? 0.8 : 0.5,
          isNovel,
        });
      }
    }
  }

  entities.sort((a, b) => b.importance - a.importance);

  const actionVerbs = userMessage.match(
    /\b(create|build|fix|analyze|compare|explain|find|search|calculate|generate|write|design|implement|optimize|debug|test|deploy|plan|review|summarize)\b/gi
  ) ?? [];
  const keyActions = [...new Set(actionVerbs.map(v => v.toLowerCase()))];

  const constraintMatches = userMessage.match(
    /\b(must|should|need to|have to|within|by|before|after|no more than|at least|at most|only|except|without|unless)\b[^.!?]*/gi
  ) ?? [];
  const keyConstraints = constraintMatches.slice(0, 4).map(c => c.trim());

  const emotionalPhrases = userMessage.match(
    /\b(i feel|i'm worried|i'm excited|i love|i hate|frustrated|anxious|happy|confused|stressed|concerned|scared|hopeful|disappointed)\b[^.!?]*/gi
  ) ?? [];
  const emotionalHotspots = emotionalPhrases.slice(0, 3).map(p => p.trim());

  const words = userMessage.split(/\s+/).length;
  const uniqueEntities = entities.length;
  const informationDensity = Math.min(1, (uniqueEntities / Math.max(words, 1)) * 5 + (keyActions.length / Math.max(words, 1)) * 8);

  const focusPoint = entities.length > 0
    ? entities[0].text
    : keyActions.length > 0
    ? keyActions[0]
    : userMessage.substring(0, 40).trim();

  const peripheralContext = entities.slice(1, 4).map(e => e.text);

  console.log('[SALIENCE] Map:', {
    entities: entities.length,
    actions: keyActions.length,
    constraints: keyConstraints.length,
    density: informationDensity.toFixed(2),
    focus: focusPoint,
  });

  return {
    keyEntities: entities.slice(0, 8),
    keyActions,
    keyConstraints,
    emotionalHotspots,
    informationDensity,
    focusPoint,
    peripheralContext,
  };
}

export function buildReasoningInjection(frame: ReasoningFrame): string {
  const parts: string[] = [];

  if (frame.biases.length > 0) {
    const biasWarnings = frame.biases
      .filter(b => b.severity > 0.4)
      .slice(0, 3)
      .map(b => `- ⚠ ${b.type.replace(/_/g, ' ')} bias: ${b.description}. Mitigation: ${b.mitigation}`);
    if (biasWarnings.length > 0) {
      parts.push(`### Cognitive Bias Alerts\n${biasWarnings.join('\n')}`);
    }
  }

  if (frame.contradictions.length > 0) {
    const contradictionNotes = frame.contradictions
      .slice(0, 2)
      .map(c => `- Contradiction: "${c.claim1.substring(0, 50)}" vs "${c.claim2.substring(0, 50)}". ${c.resolution}`);
    parts.push(`### Contradictions Detected\n${contradictionNotes.join('\n')}`);
  }

  if (frame.assumptions.length > 0) {
    const implicitOnes = frame.assumptions.filter(a => a.implicit);
    if (implicitOnes.length > 0) {
      parts.push(`### Implicit Assumptions\n${implicitOnes.slice(0, 3).map(a => `- "${a.statement}" — ${a.risk}`).join('\n')}`);
    }
  }

  if (frame.analogies.length > 0) {
    parts.push(`### Analogies Detected\nLeverage user's analogy: ${frame.analogies[0].source}`);
  }

  if (frame.inferenceChain.length > 0) {
    const lowConfidence = frame.inferenceChain.filter(s => s.confidence < 0.4);
    if (lowConfidence.length > 0) {
      parts.push(`### Low-Confidence Inferences\n${lowConfidence.map(s => `- ${s.conclusion} (${(s.confidence * 100).toFixed(0)}%)`).join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  return '## Advanced Reasoning\n' + parts.join('\n\n');
}

export function buildSalienceInjection(salience: SalienceMap): string {
  const parts: string[] = [];

  if (salience.keyEntities.length > 0) {
    const novelEntities = salience.keyEntities.filter(e => e.isNovel);
    if (novelEntities.length > 0) {
      parts.push(`New entities (not in memory): ${novelEntities.map(e => `"${e.text}" (${e.type})`).join(', ')}. Consider storing if significant.`);
    }
  }

  if (salience.keyConstraints.length > 0) {
    parts.push(`User constraints to respect: ${salience.keyConstraints.join('; ')}`);
  }

  if (salience.emotionalHotspots.length > 0) {
    parts.push(`Emotional markers: ${salience.emotionalHotspots.join('; ')} — address these with sensitivity.`);
  }

  if (salience.informationDensity > 0.7) {
    parts.push(`High information density. Ensure you address all key elements: focus="${salience.focusPoint}", also: ${salience.peripheralContext.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return '## Salience & Focus\n' + parts.join('\n');
}
