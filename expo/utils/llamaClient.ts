import AsyncStorage from '@react-native-async-storage/async-storage';

const LLAMA_CONFIG_KEY = 'nexus_llama_config';

export interface LlamaConfig {
  serverUrl: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  repeatPenalty: number;
  contextSize: number;
}

export const DEFAULT_LLAMA_CONFIG: LlamaConfig = {
  serverUrl: 'http://localhost:8080',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  repeatPenalty: 1.1,
  contextSize: 4096,
};

export async function loadLlamaConfig(): Promise<LlamaConfig> {
  try {
    const raw = await AsyncStorage.getItem(LLAMA_CONFIG_KEY);
    if (!raw) return DEFAULT_LLAMA_CONFIG;
    return { ...DEFAULT_LLAMA_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LLAMA_CONFIG;
  }
}

export async function saveLlamaConfig(config: LlamaConfig): Promise<void> {
  await AsyncStorage.setItem(LLAMA_CONFIG_KEY, JSON.stringify(config));
  console.log('[LLAMA] Config saved:', config.serverUrl);
}

export interface LlamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LlamaToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlamaStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export interface LlamaCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: LlamaChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${serverUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function streamChatCompletion(
  config: LlamaConfig,
  messages: LlamaChatMessage[],
  tools?: LlamaToolDefinition[],
  onChunk: (chunk: LlamaStreamChunk) => void = () => {},
  signal?: AbortSignal,
): Promise<LlamaChatMessage> {
  const url = `${config.serverUrl}/v1/chat/completions`;
  console.log('[LLAMA] Streaming request to:', url, 'messages:', messages.length);

  const body: Record<string, unknown> = {
    messages,
    stream: true,
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    repeat_penalty: config.repeatPenalty,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.log('[LLAMA] Server error:', response.status, errorText.substring(0, 200));
    throw new Error(`llama.cpp server error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  let fullContent = '';
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

  if (!response.body) {
    const json = await response.json() as LlamaCompletionResponse;
    const msg = json.choices[0]?.message;
    if (msg) return msg;
    throw new Error('No response from llama.cpp server');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data) as LlamaStreamChunk;
          onChunk(chunk);

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCalls.get(tc.index);
              if (!existing) {
                toolCalls.set(tc.index, {
                  id: tc.id ?? `call_${tc.index}_${Date.now()}`,
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                });
              } else {
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              }
            }
          }
        } catch (e) {
          console.log('[LLAMA] Chunk parse error:', e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result: LlamaChatMessage = {
    role: 'assistant',
    content: fullContent,
  };

  if (toolCalls.size > 0) {
    result.tool_calls = Array.from(toolCalls.values()).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }));
  }

  console.log('[LLAMA] Stream complete, content length:', fullContent.length, 'tool_calls:', toolCalls.size);
  return result;
}

export async function chatCompletion(
  config: LlamaConfig,
  messages: LlamaChatMessage[],
  tools?: LlamaToolDefinition[],
): Promise<LlamaChatMessage> {
  const url = `${config.serverUrl}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    messages,
    stream: false,
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    repeat_penalty: config.repeatPenalty,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`llama.cpp server error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const json = await response.json() as LlamaCompletionResponse;
  const msg = json.choices[0]?.message;
  if (!msg) throw new Error('No response from llama.cpp server');
  console.log('[LLAMA] Completion done, tokens:', json.usage?.completion_tokens ?? 'unknown');
  return msg;
}

export async function generateTextViaLlama(
  config: LlamaConfig,
  messages: LlamaChatMessage[],
): Promise<string> {
  const msg = await chatCompletion(config, messages);
  return msg.content ?? '';
}
