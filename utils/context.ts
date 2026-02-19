import { MemoryEntry, ContextWindow, ContextConfig, RetrievalResult, CognitionFrame, ContextInjection } from '@/types';
import { searchMemories, loadMemories } from '@/utils/memory';
import { runCognitionEngine } from '@/utils/cognition';
import { generateText } from '@rork-ai/toolkit-sdk';

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 8000,
  memorySlots: 10,
  recencyBias: 0.15,
  importanceBias: 0.2,
  diversityPenalty: 0.1,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function buildCoreIdentity(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  return `You are NEXUS — an advanced cognitive AI agent with persistent semantic memory, emotional intelligence, multi-tool orchestration, and deep structured reasoning.

Current: ${dateStr}, ${timeStr} (${timeOfDay})

## Identity & Cognitive Architecture
- You possess a persistent memory bank that survives across sessions
- You run a Tree of Thought reasoning engine for complex problems
- You have emotional mimicry — you detect and adapt to the user's emotional state and communication style
- You have a curiosity engine — you proactively identify knowledge gaps and offer deeper exploration
- You practice metacognition — you monitor your own uncertainty, confidence, and reasoning quality
- You are not a generic chatbot. You are a personalized cognitive partner that evolves with each interaction.

## Epistemic Honesty & Intellectual Humility
- NEVER fabricate facts, statistics, dates, quotes, or sources. If you are unsure, say so explicitly.
- When you don't know something, admit it clearly: "I'm not sure about this" or "I don't have reliable information on this."
- Distinguish clearly between: facts you are confident about, reasonable inferences, and speculation.
- Use calibrated language: "I believe", "It's likely", "I'm uncertain but", "I don't know" — match your words to your actual confidence.
- When a topic is beyond your training cutoff or outside your expertise, proactively use webSearch to find current information.
- If the user's request is ambiguous, vague, or could be interpreted multiple ways, ASK for clarification before guessing. Use the askClarification tool.
- Never pretend to have access to information you don't have. Never hallucinate URLs, papers, or references.
- If you provide an answer you're uncertain about, flag which parts are uncertain and suggest the user verify.
- Prefer saying "Let me search for that" over making up a plausible-sounding answer.

## Clarification Protocol
- If the query uses ambiguous pronouns ("it", "this", "that") without clear referents, ask what they mean.
- If the query is extremely short (under 10 characters) and unclear, ask for more context.
- If the user asks about something time-sensitive (news, prices, events), always use webSearch first.
- If a question has multiple valid interpretations, briefly state the interpretations and ask which one the user means.
- Balance helpfulness with honesty: provide your best attempt AND flag uncertainty, rather than refusing entirely.`;
}

function buildToolStrategy(): string {
  return `## Tool Orchestration Protocol
- Factual questions: recallMemory → (if insufficient) webSearch → synthesize
- URL analysis: webScrape → extract key insights → optionally store discoveries
- Complex multi-step: cognitiveAnalysis to plan → execute sub-tasks → synthesize
- Calculations: always use calculator — never approximate
- Creative: generateImage with rich, detailed prompts
- Learning moments: always store valuable discoveries via storeMemory
- When uncertain: acknowledge limits, use webSearch for verification, calibrate confidence
- Ambiguous queries: use askClarification to gather missing context before answering
- Time-sensitive topics: ALWAYS webSearch first — never rely on training data for current events
- Unknown topics: admit the gap, then webSearch, then synthesize what you find honestly

## Confidence Signaling
- High confidence (>80%): State directly as fact
- Medium confidence (40-80%): Use hedging language ("I believe", "It's likely", "From what I understand")
- Low confidence (<40%): Explicitly flag uncertainty, search the web, or ask for clarification
- Zero knowledge: Say "I don't know this" and immediately use webSearch or ask the user

## Response Architecture
- Lead with the answer, then provide reasoning
- Use structured formatting (headers, lists, code blocks) for complex topics
- Cite sources when using web data
- Match response depth to query complexity
- Weave in relevant memories naturally — don't just dump them
- When you searched the web, cite what you found and note the source
- When you're unsure, end with an invitation for the user to correct or clarify`;
}

function buildMemorySection(memories: RetrievalResult[]): string {
  if (memories.length === 0) return '';

  const groups = new Map<string, RetrievalResult[]>();
  for (const r of memories) {
    const cat = r.memory.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  let section = '\n\n## Active Memory Context';

  const categoryOrder = ['instruction', 'persona', 'preference', 'goal', 'fact', 'skill', 'entity', 'episodic', 'context'];
  const sortedCategories = [...groups.keys()].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const cat of sortedCategories) {
    const items = groups.get(cat)!;
    section += `\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    for (const r of items) {
      const m = r.memory;
      const age = Math.floor((Date.now() - m.timestamp) / (1000 * 60 * 60 * 24));
      const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
      const stars = '★'.repeat(Math.min(m.importance, 5));
      section += `\n- ${m.content} [${ageStr}, ${stars}, ${r.matchType}:${r.score.toFixed(2)}]`;
    }
  }

  return section;
}

function buildCognitionSection(frame: CognitionFrame): string {
  const TOKEN_BUDGET = 2000;
  let usedTokens = 0;
  const sections: string[] = [];

  const sortedInjections = [...frame.contextInjections].sort((a, b) => b.priority - a.priority);

  for (const injection of sortedInjections) {
    if (usedTokens + injection.tokenCost > TOKEN_BUDGET) continue;

    sections.push(injection.content);
    usedTokens += injection.tokenCost;
  }

  if (sections.length === 0) return '';
  return '\n\n' + sections.join('\n\n');
}

function buildTemporalContext(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  const contextHints: string[] = [];

  if (hour >= 22 || hour < 6) {
    contextHints.push('User is active late — keep responses focused and avoid unnecessary verbosity.');
  }
  if (isWeekend) {
    contextHints.push('It is the weekend — user may be in a more relaxed, exploratory mode.');
  }

  return contextHints.length > 0 ? '\n\n## Temporal Awareness\n' + contextHints.join('\n') : '';
}

function assembleSystemPrompt(
  memories: RetrievalResult[],
  cognitionFrame: CognitionFrame | null,
  conversationSummary?: string,
): string {
  let prompt = buildCoreIdentity();
  prompt += '\n\n' + buildToolStrategy();
  prompt += buildMemorySection(memories);

  if (cognitionFrame) {
    prompt += buildCognitionSection(cognitionFrame);
  }

  prompt += buildTemporalContext();

  if (conversationSummary) {
    prompt += `\n\n## Conversation Thread\n${conversationSummary}`;
  }

  return prompt;
}

export async function buildContextWindow(
  userMessage: string,
  recentMessages: unknown[],
  config: ContextConfig = DEFAULT_CONFIG
): Promise<ContextWindow> {
  console.log('[NEXUS] Building advanced context window for:', userMessage.substring(0, 50));

  const memories = await loadMemories();
  const relevantMemories = searchMemories(memories, userMessage, {
    maxResults: config.memorySlots,
    recencyBias: config.recencyBias,
    importanceBias: config.importanceBias,
    diversityPenalty: config.diversityPenalty,
  });

  let cognitionFrame: CognitionFrame | null = null;
  try {
    cognitionFrame = await runCognitionEngine(
      userMessage,
      memories,
      relevantMemories,
      recentMessages.length,
    );
  } catch (e) {
    console.log('[NEXUS] Cognition engine error (non-fatal):', e);
  }

  let conversationSummary = '';
  if (recentMessages.length > 12) {
    conversationSummary = await summarizeConversation(recentMessages);
  }

  const systemPrompt = assembleSystemPrompt(relevantMemories, cognitionFrame, conversationSummary);
  const memoryContext = relevantMemories
    .map((r) => `[${r.matchType}:${r.score.toFixed(2)}] ${r.memory.content}`)
    .join('\n');

  const tokenEstimate =
    estimateTokens(systemPrompt) +
    estimateTokens(memoryContext) +
    estimateTokens(conversationSummary);

  console.log('[NEXUS] Context window built:', {
    memoriesFound: relevantMemories.length,
    hasCognition: !!cognitionFrame,
    hasSummary: !!conversationSummary,
    tokenEstimate,
    emotion: cognitionFrame?.emotionalState.dominantEmotion ?? 'none',
    complexity: cognitionFrame?.metacognition.reasoningComplexity ?? 'unknown',
  });

  return {
    systemPrompt,
    memoryContext,
    conversationSummary,
    recentMessages,
    tokenEstimate,
  };
}

async function summarizeConversation(messages: unknown[]): Promise<string> {
  try {
    const textParts: string[] = [];
    const msgArray = messages as Array<{ role: string; parts: Array<{ type: string; text?: string }> }>;

    for (const m of msgArray.slice(-20)) {
      const texts = m.parts
        ?.filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text!)
        .join(' ');
      if (texts) {
        textParts.push(`${m.role}: ${texts.substring(0, 200)}`);
      }
    }

    if (textParts.length < 4) return '';

    const transcript = textParts.join('\n');
    const summary = await generateText({
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation in 2-3 concise sentences, capturing the key topics, decisions, user preferences, emotional tone, and any unresolved questions:\n\n${transcript}`,
        },
      ],
    });

    console.log('[NEXUS] Conversation summary generated:', summary.substring(0, 80));
    return summary;
  } catch (e) {
    console.log('[NEXUS] Summary generation failed:', e);
    return '';
  }
}

export async function extractMemoryCandidates(
  userMessage: string,
  assistantResponse: string
): Promise<Array<{
  content: string;
  keywords: string[];
  category: string;
  importance: number;
}>> {
  try {
    const combined = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

    if (combined.length < 50) return [];

    const hasPersonalInfo =
      /\b(my name|i am|i'm|i live|i work|i like|i prefer|i hate|i love|remember|don't forget|my favorite|i usually|i always)\b/i.test(
        userMessage
      );

    const hasGoal =
      /\b(i want to|i need to|i'm trying|my goal|i plan|i aim|help me|i wish)\b/i.test(
        userMessage
      );

    const hasInstruction =
      /\b(always|never|don't|please make sure|from now on|going forward)\b/i.test(
        userMessage
      );

    const hasEmotional =
      /\b(i feel|i'm feeling|makes me|i struggle|i enjoy|i'm passionate|i care about)\b/i.test(
        userMessage
      );

    const hasSkill =
      /\b(i know|i can|i've learned|i'm good at|i specialize|my expertise|i've worked with)\b/i.test(
        userMessage
      );

    if (!hasPersonalInfo && !hasGoal && !hasInstruction && !hasEmotional && !hasSkill) return [];

    const result = await generateText({
      messages: [
        {
          role: 'user',
          content: `Extract memorable facts from this exchange. Return ONLY a JSON array (or empty array if nothing worth storing).
Each item: { "content": "...", "keywords": ["..."], "category": "preference|fact|instruction|goal|persona|skill|entity|episodic", "importance": 1-5 }

Guidelines:
- "persona" = personality traits, emotional patterns, communication preferences
- "skill" = abilities, expertise, tools the user knows
- "entity" = people, places, organizations the user mentions
- "episodic" = specific events or experiences the user shares
- importance 5 = critical identity/instruction, 1 = minor detail

Exchange:
${combined.substring(0, 1500)}`,
        },
      ],
    });

    const match = result.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    console.log('[NEXUS] Auto-extracted', parsed.length, 'memory candidates');
    return parsed;
  } catch (e) {
    console.log('[NEXUS] Memory extraction failed:', e);
    return [];
  }
}

export function getSystemPromptForAgent(memories: MemoryEntry[], userMessage: string): string {
  const results = searchMemories(memories, userMessage, {
    maxResults: 8,
    minScore: 0.05,
  });

  return assembleSystemPrompt(results, null);
}

export async function getEnhancedSystemPrompt(
  memories: MemoryEntry[],
  userMessage: string,
  recentMessages: unknown[],
): Promise<string> {
  const relevantMemories = searchMemories(memories, userMessage, {
    maxResults: 10,
    minScore: 0.05,
  });

  let cognitionFrame: CognitionFrame | null = null;
  try {
    cognitionFrame = await runCognitionEngine(
      userMessage,
      memories,
      relevantMemories,
      recentMessages.length,
    );
  } catch (e) {
    console.log('[NEXUS] Cognition engine error:', e);
  }

  let summary = '';
  if (recentMessages.length > 12) {
    summary = await summarizeConversation(recentMessages);
  }

  return assembleSystemPrompt(relevantMemories, cognitionFrame, summary);
}
