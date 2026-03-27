import { IntentType, IntentClassification } from '@/types';

interface IntentPattern {
  pattern: RegExp;
  intent: IntentType;
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  { pattern: /^(what|who|when|where|which)\b.*\?$/i, intent: 'question_factual', weight: 0.9 },
  { pattern: /\b(what is|what are|who is|who are|when did|when was|where is)\b/i, intent: 'question_factual', weight: 0.8 },
  { pattern: /\b(define|definition of|meaning of)\b/i, intent: 'question_factual', weight: 0.7 },

  { pattern: /\b(what do you think|your opinion|do you think|would you say|your take)\b/i, intent: 'question_opinion', weight: 0.85 },
  { pattern: /\b(should i|is it worth|better to|recommend)\b/i, intent: 'question_opinion', weight: 0.7 },

  { pattern: /^how\b.*\?$/i, intent: 'question_how', weight: 0.8 },
  { pattern: /\b(how do i|how can i|how to|how does|how would|steps to|way to)\b/i, intent: 'question_how', weight: 0.85 },
  { pattern: /\b(tutorial|guide|walkthrough|instructions)\b/i, intent: 'question_how', weight: 0.6 },

  { pattern: /^why\b.*\?$/i, intent: 'question_why', weight: 0.85 },
  { pattern: /\b(why does|why is|why do|reason for|cause of|explain why)\b/i, intent: 'question_why', weight: 0.8 },

  { pattern: /\b(compare|versus|vs\.?|difference between|better.*or|which is better)\b/i, intent: 'question_comparison', weight: 0.85 },
  { pattern: /\b(pros and cons|trade-?offs|advantages|disadvantages)\b/i, intent: 'question_comparison', weight: 0.7 },

  { pattern: /\b(please|can you|could you|would you|will you)\b.*\b(do|make|create|set|run|find|get|send|fix|update|change|delete|remove|add|install)\b/i, intent: 'request_action', weight: 0.8 },
  { pattern: /^(do|make|set|run|find|get|send|fix|update|change|delete|remove|add|install)\b/i, intent: 'request_action', weight: 0.75 },

  { pattern: /\b(create|write|generate|compose|draft|design|build|make me)\b/i, intent: 'request_creation', weight: 0.8 },
  { pattern: /\b(poem|story|essay|code|script|song|article|email|letter|report)\b/i, intent: 'request_creation', weight: 0.5 },

  { pattern: /\b(analyze|evaluate|assess|review|critique|audit|examine|investigate)\b/i, intent: 'request_analysis', weight: 0.85 },
  { pattern: /\b(break down|deep dive|dissect|deconstruct)\b/i, intent: 'request_analysis', weight: 0.75 },

  { pattern: /\b(search|look up|find|google|research)\b.*\b(for|about|on)\b/i, intent: 'request_search', weight: 0.8 },
  { pattern: /\b(latest|current|recent|news|update on)\b/i, intent: 'request_search', weight: 0.6 },

  { pattern: /\b(remember|recall|what did i|you stored|my preference|do you know my)\b/i, intent: 'request_memory', weight: 0.85 },
  { pattern: /\b(i told you|i mentioned|last time|we discussed)\b/i, intent: 'request_memory', weight: 0.7 },

  { pattern: /\b(calculate|compute|solve|equation|formula|math|percentage|convert)\b/i, intent: 'request_calculation', weight: 0.85 },
  { pattern: /\d+\s*[+\-*/^%]\s*\d+/, intent: 'request_calculation', weight: 0.9 },

  { pattern: /\b(i think|i believe|in my opinion|personally|my view)\b/i, intent: 'statement_opinion', weight: 0.7 },
  { pattern: /\b(i feel|i'm feeling|feeling|makes me feel|emotionally)\b/i, intent: 'statement_emotion', weight: 0.8 },
  { pattern: /\b(always|never|from now on|going forward|make sure you|don't ever|i want you to)\b/i, intent: 'statement_instruction', weight: 0.75 },
  { pattern: /\b(actually|the fact is|it's actually|fyi|for your info)\b/i, intent: 'statement_fact', weight: 0.6 },

  { pattern: /^(hi|hey|hello|good morning|good evening|good afternoon|howdy|yo|sup|what's up)\b/i, intent: 'social_greeting', weight: 0.9 },
  { pattern: /^(bye|goodbye|see you|later|gotta go|take care|good night)\b/i, intent: 'social_farewell', weight: 0.9 },
  { pattern: /\b(thanks|thank you|appreciate|grateful|cheers)\b/i, intent: 'social_gratitude', weight: 0.8 },
  { pattern: /\b(sorry|apologize|my bad|excuse me|pardon)\b/i, intent: 'social_apology', weight: 0.7 },

  { pattern: /\b(no|wrong|incorrect|that's not|you're wrong|actually it's|correction)\b/i, intent: 'meta_correction', weight: 0.75 },
  { pattern: /\b(i meant|what i mean|to clarify|let me rephrase|more specifically)\b/i, intent: 'meta_clarification', weight: 0.8 },
  { pattern: /\b(good job|well done|that's great|perfect|exactly|not what i wanted|bad answer|unhelpful)\b/i, intent: 'meta_feedback', weight: 0.7 },

  { pattern: /\b(brainstorm|ideas|possibilities|what could|come up with|think of)\b/i, intent: 'exploration_brainstorm', weight: 0.8 },
  { pattern: /\b(debate|argue|devil's advocate|counterpoint|other side)\b/i, intent: 'exploration_debate', weight: 0.8 },
  { pattern: /\b(what if|imagine|hypothetically|suppose|let's say|thought experiment)\b/i, intent: 'exploration_hypothetical', weight: 0.85 },
];

const RESPONSE_LENGTH_SIGNALS: Array<{ pattern: RegExp; length: IntentClassification['expectedResponseLength'] }> = [
  { pattern: /\b(brief|short|quick|one line|tldr|tl;dr|in a word|yes or no)\b/i, length: 'brief' },
  { pattern: /\b(detailed|thorough|comprehensive|in depth|deep dive|elaborate|explain fully|everything)\b/i, length: 'comprehensive' },
  { pattern: /\b(explain|describe|walk me through|tell me about)\b/i, length: 'detailed' },
];

const ACTION_INTENTS: Set<IntentType> = new Set([
  'request_action', 'request_creation', 'request_analysis',
  'request_search', 'request_memory', 'request_calculation',
]);

const KNOWLEDGE_INTENTS: Set<IntentType> = new Set([
  'question_factual', 'question_how', 'question_why',
  'question_comparison', 'request_search', 'request_analysis',
]);

const CREATIVITY_INTENTS: Set<IntentType> = new Set([
  'request_creation', 'exploration_brainstorm',
  'exploration_hypothetical', 'exploration_debate',
]);

export function classifyIntent(userMessage: string, conversationLength: number): IntentClassification {
  const scores = new Map<IntentType, number>();

  for (const { pattern, intent, weight } of INTENT_PATTERNS) {
    const matches = userMessage.match(pattern);
    if (matches) {
      const current = scores.get(intent) ?? 0;
      scores.set(intent, Math.max(current, weight));
    }
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  let primary: IntentType = 'question_factual';
  let secondary: IntentType | null = null;
  let confidence = 0.3;

  if (sorted.length > 0) {
    primary = sorted[0][0];
    confidence = sorted[0][1];
  }

  if (sorted.length > 1 && sorted[1][1] > 0.5) {
    secondary = sorted[1][0];
  }

  const subIntents = sorted
    .filter(([, score]) => score > 0.4)
    .map(([intent]) => intent)
    .slice(0, 4);

  const isMultiIntent = subIntents.length > 2 ||
    (userMessage.match(/\b(and|also|plus|additionally|then)\b/gi)?.length ?? 0) >= 2;

  let urgency = 0;
  if (/\b(asap|urgent|immediately|right now|hurry|critical|emergency|deadline)\b/i.test(userMessage)) {
    urgency = 0.9;
  } else if (/\b(soon|quickly|fast|today|tonight)\b/i.test(userMessage)) {
    urgency = 0.5;
  } else if (/[!]{2,}/.test(userMessage)) {
    urgency = 0.4;
  }

  let expectedResponseLength: IntentClassification['expectedResponseLength'] = 'moderate';
  for (const { pattern, length } of RESPONSE_LENGTH_SIGNALS) {
    if (pattern.test(userMessage)) {
      expectedResponseLength = length;
      break;
    }
  }

  if (expectedResponseLength === 'moderate') {
    if (primary.startsWith('social_')) {
      expectedResponseLength = 'brief';
    } else if (primary === 'request_analysis' || primary === 'question_comparison') {
      expectedResponseLength = 'detailed';
    } else if (userMessage.length > 300) {
      expectedResponseLength = 'detailed';
    } else if (userMessage.length < 30) {
      expectedResponseLength = 'brief';
    }
  }

  if (conversationLength === 0 && primary.startsWith('social_greeting')) {
    confidence = Math.min(1, confidence + 0.1);
  }

  console.log('[INTENT] Classification:', {
    primary,
    secondary,
    confidence: confidence.toFixed(2),
    isMultiIntent,
    urgency: urgency.toFixed(2),
    responseLength: expectedResponseLength,
  });

  return {
    primary,
    secondary,
    confidence,
    requiresAction: ACTION_INTENTS.has(primary),
    requiresKnowledge: KNOWLEDGE_INTENTS.has(primary),
    requiresCreativity: CREATIVITY_INTENTS.has(primary),
    isMultiIntent,
    subIntents,
    urgency,
    expectedResponseLength,
  };
}

export function buildIntentInjection(intent: IntentClassification): string {
  const parts: string[] = [];

  if (intent.isMultiIntent && intent.subIntents.length > 1) {
    parts.push(`Multi-intent query detected. Address each sub-intent: ${intent.subIntents.map(i => i.replace(/_/g, ' ')).join(', ')}.`);
  }

  if (intent.primary.startsWith('social_')) {
    parts.push(`Social exchange (${intent.primary.replace('social_', '')}). Keep it natural and warm. Match the social register.`);
  }

  if (intent.primary === 'meta_correction') {
    parts.push(`The user is correcting you. Acknowledge the correction gracefully, update your understanding, and avoid being defensive.`);
  }

  if (intent.primary === 'meta_feedback') {
    parts.push(`The user is giving feedback. Acknowledge it sincerely and adjust your behavior accordingly.`);
  }

  if (intent.primary === 'statement_instruction') {
    parts.push(`The user is setting an instruction. Confirm understanding, store this as a high-priority memory, and follow it going forward.`);
  }

  if (intent.primary === 'statement_emotion') {
    parts.push(`The user is expressing emotions. Lead with empathy and validation before any practical response.`);
  }

  if (intent.primary === 'exploration_hypothetical') {
    parts.push(`Hypothetical/thought experiment. Engage creatively, explore implications, and build on the premise without over-qualifying.`);
  }

  if (intent.primary === 'exploration_debate') {
    parts.push(`Debate mode. Present multiple perspectives fairly, play devil's advocate when appropriate, and be intellectually rigorous.`);
  }

  if (intent.urgency > 0.6) {
    parts.push(`HIGH URGENCY detected. Lead with the actionable answer. Skip preamble. Be concise and direct.`);
  }

  switch (intent.expectedResponseLength) {
    case 'brief':
      parts.push(`User expects a brief response. Be concise — 1-3 sentences ideally.`);
      break;
    case 'comprehensive':
      parts.push(`User wants comprehensive depth. Provide thorough coverage with structure, examples, and nuance.`);
      break;
    case 'detailed':
      parts.push(`Provide a detailed response with clear structure. Use headers, lists, or code blocks where helpful.`);
      break;
  }

  if (parts.length === 0) return '';
  return '## Intent Analysis\n' + parts.join('\n');
}
