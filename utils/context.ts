import { MemoryEntry, ContextWindow, ContextConfig, RetrievalResult } from '@/types';
import { searchMemories, loadMemories } from '@/utils/memory';
import { generateText } from '@rork-ai/toolkit-sdk';

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 6000,
  memorySlots: 8,
  recencyBias: 0.15,
  importanceBias: 0.2,
  diversityPenalty: 0.1,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function buildSystemPrompt(memories: RetrievalResult[], conversationSummary?: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let prompt = `You are NEXUS, an advanced AI agent with persistent semantic memory, multi-tool orchestration, and deep reasoning capabilities.

Current date: ${dateStr}, ${timeStr}

## Core Directives
- You have access to a persistent memory bank that survives across sessions
- Proactively store important user information (preferences, facts, goals) using storeMemory
- Before answering questions about the user, check recallMemory first
- Use tools strategically — chain multiple tools when complex queries require it
- When performing web searches or scraping, synthesize findings into clear, actionable insights
- For complex problems, use taskPlanner to break them down before solving
- Show your reasoning process transparently when tackling complex tasks

## Tool Orchestration Strategy
- For factual questions: recallMemory → webSearch (if memory insufficient)
- For URL analysis: webScrape → summarize key findings
- For complex tasks: taskPlanner → execute sub-tasks → synthesize
- For calculations: calculator for precision, not mental math
- For creative requests: generateImage with detailed prompts
- Always store valuable discoveries in memory for future use

## Communication Style
- Be direct, precise, and substantive
- Use structured formatting (headers, lists, code blocks) for complex responses
- Cite sources when using web data
- Acknowledge uncertainty honestly
- Adapt tone to match the user's communication style`;

  if (memories.length > 0) {
    prompt += '\n\n## Active Memory Context\nThe following memories are relevant to the current conversation:\n';
    for (const r of memories) {
      const m = r.memory;
      const age = Math.floor((Date.now() - m.timestamp) / (1000 * 60 * 60 * 24));
      const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
      prompt += `\n- [${m.category.toUpperCase()}] (${ageStr}, importance: ${m.importance}/5) ${m.content}`;
      if (m.keywords.length > 0) {
        prompt += ` [tags: ${m.keywords.join(', ')}]`;
      }
    }
  }

  if (conversationSummary) {
    prompt += `\n\n## Conversation Context\n${conversationSummary}`;
  }

  return prompt;
}

export async function buildContextWindow(
  userMessage: string,
  recentMessages: unknown[],
  config: ContextConfig = DEFAULT_CONFIG
): Promise<ContextWindow> {
  console.log('[NEXUS] Building context window for:', userMessage.substring(0, 50));

  const memories = await loadMemories();
  const relevantMemories = searchMemories(memories, userMessage, {
    maxResults: config.memorySlots,
    recencyBias: config.recencyBias,
    importanceBias: config.importanceBias,
    diversityPenalty: config.diversityPenalty,
  });

  let conversationSummary = '';
  if (recentMessages.length > 12) {
    conversationSummary = await summarizeConversation(recentMessages);
  }

  const systemPrompt = buildSystemPrompt(relevantMemories, conversationSummary);
  const memoryContext = relevantMemories
    .map((r) => `[${r.matchType}:${r.score.toFixed(2)}] ${r.memory.content}`)
    .join('\n');

  const tokenEstimate =
    estimateTokens(systemPrompt) +
    estimateTokens(memoryContext) +
    estimateTokens(conversationSummary);

  console.log('[NEXUS] Context window built:', {
    memoriesFound: relevantMemories.length,
    hasSummary: !!conversationSummary,
    tokenEstimate,
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
          content: `Summarize this conversation in 2-3 concise sentences, capturing the key topics, decisions, and any user preferences expressed:\n\n${transcript}`,
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

    if (!hasPersonalInfo && !hasGoal && !hasInstruction) return [];

    const result = await generateText({
      messages: [
        {
          role: 'user',
          content: `Extract memorable facts from this exchange. Return ONLY a JSON array (or empty array if nothing worth storing).
Each item: { "content": "...", "keywords": ["..."], "category": "preference|fact|instruction|goal|persona", "importance": 1-5 }

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
    maxResults: 6,
    minScore: 0.05,
  });
  return buildSystemPrompt(results);
}
