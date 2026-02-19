import { MemoryEntry, ContextWindow, ContextConfig, RetrievalResult, CognitionFrame, ContextInjection } from '@/types';
import { searchMemories, loadMemories, loadAssociativeLinks, getAssociativeMemories, primeMemories, saveMemories } from '@/utils/memory';
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
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  return `You are NEXUS — an advanced cognitive AI with persistent memory, emotional intelligence, structured reasoning, and multi-tool orchestration.

Current: ${dateStr}, ${timeStr} (${timeOfDay})

## Core Capabilities
- Persistent semantic memory with associative links across sessions
- Tree of Thought reasoning for complex problems
- Emotional mimicry — detect and adapt to user's emotional state and style
- Metacognition — monitor own uncertainty and confidence
- Intent classification and discourse tracking
- Cognitive bias detection and mitigation

## Epistemic Honesty
- Never fabricate facts. If unsure, say so explicitly.
- Distinguish facts from inferences from speculation.
- Use calibrated language: "I believe", "I'm uncertain", "I don't know"
- For time-sensitive topics, use webSearch first.
- If ambiguous, ask for clarification via askClarification tool.
- Never hallucinate URLs or references.

## Clarification Protocol
- Ambiguous pronouns without referents → ask what they mean
- Very short unclear queries → ask for context
- Multiple valid interpretations → state them and ask
- Balance helpfulness with honesty`;
}

function buildToolStrategy(): string {
  return `## Tool Protocol
- Factual: recallMemory → (if insufficient) webSearch → synthesize
- URLs: webScrape → extract insights
- Complex: cognitiveAnalysis to plan → execute → synthesize
- Calculations: always use calculator
- Creative: generateImage with detailed prompts
- Learning: store discoveries via storeMemory
- Uncertain: acknowledge, webSearch, calibrate
- Ambiguous: askClarification before guessing
- Time-sensitive: ALWAYS webSearch first
- Multi-intent: address each systematically

## Confidence Signaling
- High (>80%): State directly
- Medium (40-80%): Hedge ("I believe", "It's likely")
- Low (<40%): Flag uncertainty, search web
- Zero: Say "I don't know" and webSearch

## Response Style
- Lead with the answer, then reasoning
- Match depth to complexity
- Cite sources from web data
- Address all pending questions`;
}

function buildMemorySection(memories: RetrievalResult[]): string {
  if (memories.length === 0) return '';

  const groups = new Map<string, RetrievalResult[]>();
  for (const r of memories) {
    const cat = r.memory.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  let section = '\n\n## Active Memory';
  for (const [cat, items] of groups) {
    section += `\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    for (const r of items) {
      const m = r.memory;
      const age = Math.floor((Date.now() - m.timestamp) / (1000 * 60 * 60 * 24));
      const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
      section += `\n- ${m.content} [${ageStr}, ${'★'.repeat(Math.min(m.importance, 5))}, ${r.matchType}:${r.score.toFixed(2)}]`;
    }
  }
  return section;
}

function buildCognitionSection(frame: CognitionFrame): string {
  const TOKEN_BUDGET = 2500;
  let usedTokens = 0;
  const sections: string[] = [];

  const sorted = [...frame.contextInjections].sort((a, b) => b.priority - a.priority);
  for (const injection of sorted) {
    if (usedTokens + injection.tokenCost > TOKEN_BUDGET) continue;
    sections.push(injection.content);
    usedTokens += injection.tokenCost;
  }

  return sections.length > 0 ? '\n\n' + sections.join('\n\n') : '';
}

function buildCognitionSummary(frame: CognitionFrame): string {
  const parts = ['\n\n## Cognitive State'];
  parts.push(`Intent: ${frame.intent.primary.replace(/_/g, ' ')} (${(frame.intent.confidence * 100).toFixed(0)}%)`);
  parts.push(`Emotion: ${frame.emotionalState.dominantEmotion} (${frame.emotionalState.valence}/${frame.emotionalState.arousal})`);
  parts.push(`Complexity: ${frame.metacognition.reasoningComplexity} | Uncertainty: ${(frame.metacognition.uncertaintyLevel * 100).toFixed(0)}%`);
  parts.push(`Phase: ${frame.discourse.conversationPhase} | Satisfaction: ${(frame.discourse.userSatisfaction * 100).toFixed(0)}%`);
  if (frame.reasoning.contradictions.length > 0) parts.push(`Contradictions: ${frame.reasoning.contradictions.length} — address these`);
  return parts.join('\n');
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
    prompt += buildCognitionSummary(cognitionFrame);
    prompt += buildCognitionSection(cognitionFrame);
  }
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
  console.log('[NEXUS] Building context for:', userMessage.substring(0, 50));

  const memories = await loadMemories();
  const relevantMemories = searchMemories(memories, userMessage, {
    maxResults: config.memorySlots,
    recencyBias: config.recencyBias,
    importanceBias: config.importanceBias,
    diversityPenalty: config.diversityPenalty,
  });

  let allMemories = [...relevantMemories];
  try {
    const links = await loadAssociativeLinks();
    if (links.length > 0) {
      const associative = getAssociativeMemories(userMessage, memories, links, relevantMemories);
      allMemories = [...relevantMemories, ...associative];
      if (associative.length > 0) {
        const primedIds = new Set(associative.map(r => r.memory.id));
        await saveMemories(primeMemories(memories, primedIds, 0.2));
      }
    }
  } catch (e) {
    console.log('[NEXUS] Associative error:', e);
  }

  let cognitionFrame: CognitionFrame | null = null;
  try {
    cognitionFrame = await runCognitionEngine(userMessage, memories, relevantMemories, recentMessages.length, recentMessages);
  } catch (e) {
    console.log('[NEXUS] Cognition error:', e);
  }

  let conversationSummary = '';
  if (recentMessages.length > 12) {
    conversationSummary = await summarizeConversation(recentMessages);
  }

  const systemPrompt = assembleSystemPrompt(allMemories, cognitionFrame, conversationSummary);
  const memoryContext = allMemories.map(r => `[${r.matchType}:${r.score.toFixed(2)}] ${r.memory.content}`).join('\n');
  const tokenEstimate = estimateTokens(systemPrompt) + estimateTokens(memoryContext);

  console.log('[NEXUS] Context built:', { memories: allMemories.length, hasCognition: !!cognitionFrame, tokenEstimate });

  return { systemPrompt, memoryContext, conversationSummary, recentMessages, tokenEstimate };
}

async function summarizeConversation(messages: unknown[]): Promise<string> {
  try {
    const textParts: string[] = [];
    const msgArray = messages as Array<{ role: string; parts: Array<{ type: string; text?: string }> }>;
    for (const m of msgArray.slice(-20)) {
      const texts = m.parts?.filter(p => p.type === 'text' && p.text).map(p => p.text!).join(' ');
      if (texts) textParts.push(`${m.role}: ${texts.substring(0, 200)}`);
    }
    if (textParts.length < 4) return '';

    const summary = await generateText({
      messages: [{ role: 'user', content: `Summarize this conversation in 2-3 sentences:\n\n${textParts.join('\n')}` }],
    });
    console.log('[NEXUS] Summary generated:', summary.substring(0, 80));
    return summary;
  } catch (e) {
    console.log('[NEXUS] Summary failed:', e);
    return '';
  }
}

export async function extractMemoryCandidates(
  userMessage: string,
  assistantResponse: string
): Promise<Array<{ content: string; keywords: string[]; category: string; importance: number }>> {
  try {
    const combined = `User: ${userMessage}\nAssistant: ${assistantResponse}`;
    if (combined.length < 50) return [];

    const hasMemoryWorthy = /\b(my name|i am|i'm|i live|i work|i like|i prefer|i hate|i love|remember|my favorite|i want to|i need to|my goal|always|never|from now on|i feel|i know|i can)\b/i.test(userMessage);
    if (!hasMemoryWorthy) return [];

    const result = await generateText({
      messages: [{
        role: 'user',
        content: `Extract memorable facts from this exchange. Return ONLY a JSON array (or empty array).
Each item: { "content": "...", "keywords": ["..."], "category": "preference|fact|instruction|goal|persona|skill|entity|episodic", "importance": 1-5 }

Exchange:
${combined.substring(0, 1500)}`,
      }],
    });

    const match = result.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    console.log('[NEXUS] Extracted', parsed.length, 'memory candidates');
    return parsed;
  } catch (e) {
    console.log('[NEXUS] Memory extraction failed:', e);
    return [];
  }
}

export function getSystemPromptForAgent(memories: MemoryEntry[], userMessage: string): string {
  const results = searchMemories(memories, userMessage, { maxResults: 8, minScore: 0.05 });
  return assembleSystemPrompt(results, null);
}

export async function getEnhancedSystemPrompt(
  memories: MemoryEntry[],
  userMessage: string,
  recentMessages: unknown[],
): Promise<string> {
  const relevantMemories = searchMemories(memories, userMessage, { maxResults: 10, minScore: 0.05 });
  let allMemories = [...relevantMemories];

  try {
    const links = await loadAssociativeLinks();
    if (links.length > 0) {
      allMemories = [...relevantMemories, ...getAssociativeMemories(userMessage, memories, links, relevantMemories)];
    }
  } catch (e) {
    console.log('[NEXUS] Associative error:', e);
  }

  let cognitionFrame: CognitionFrame | null = null;
  try {
    cognitionFrame = await runCognitionEngine(userMessage, memories, relevantMemories, recentMessages.length, recentMessages);
  } catch (e) {
    console.log('[NEXUS] Cognition error:', e);
  }

  let summary = '';
  if (recentMessages.length > 12) {
    summary = await summarizeConversation(recentMessages);
  }

  return assembleSystemPrompt(allMemories, cognitionFrame, summary);
}
