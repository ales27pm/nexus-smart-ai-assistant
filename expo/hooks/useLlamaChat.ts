import { useState, useCallback, useRef } from 'react';
import {
  LlamaConfig,
  LlamaChatMessage,
  LlamaToolDefinition,
  LlamaToolCall,
  streamChatCompletion,
} from '@/utils/llamaClient';

export interface MessagePart {
  type: 'text' | 'tool';
  text?: string;
  toolName?: string;
  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
}

export interface ToolDefinition {
  description: string;
  parameters: Record<string, unknown>;
  execute?: (input: Record<string, unknown>) => Promise<string | undefined>;
}

interface UseLlamaChatOptions {
  tools?: Record<string, ToolDefinition>;
}

interface UseLlamaChatReturn {
  messages: ChatMessage[];
  sendMessage: (payload: { text: string; systemPrompt?: string; files?: Array<{ type: string; mimeType: string; uri: string }> }) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  error: Error | null;
}

function generateMsgId(): string {
  return 'msg_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function buildToolDefs(tools: Record<string, ToolDefinition>): LlamaToolDefinition[] {
  return Object.entries(tools).map(([name, def]) => ({
    type: 'function' as const,
    function: {
      name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

function convertToLlamaMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
): LlamaChatMessage[] {
  const result: LlamaChatMessage[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      const textParts = msg.parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text!);
      result.push({ role: 'user', content: textParts.join('\n') });
    } else if (msg.role === 'assistant') {
      const textParts = msg.parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text!);
      const toolParts = msg.parts.filter((p) => p.type === 'tool' && p.toolName);

      if (toolParts.length > 0) {
        const toolCalls: LlamaToolCall[] = toolParts.map((p, i) => ({
          id: `tc_${i}_${Date.now()}`,
          type: 'function' as const,
          function: {
            name: p.toolName!,
            arguments: JSON.stringify(p.input ?? {}),
          },
        }));

        result.push({
          role: 'assistant',
          content: textParts.join('\n') || '',
          tool_calls: toolCalls,
        });

        for (let i = 0; i < toolParts.length; i++) {
          const tp = toolParts[i];
          if (tp.state === 'output-available' && tp.output !== undefined) {
            result.push({
              role: 'tool',
              content: typeof tp.output === 'string' ? tp.output : JSON.stringify(tp.output),
              tool_call_id: toolCalls[i].id,
              name: tp.toolName!,
            });
          }
        }
      } else {
        result.push({ role: 'assistant', content: textParts.join('\n') || '' });
      }
    }
  }

  return result;
}

export function useLlamaChat(
  config: LlamaConfig,
  options: UseLlamaChatOptions = {},
): UseLlamaChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const toolsRef = useRef(options.tools);
  toolsRef.current = options.tools;

  const runCompletion = useCallback(async (
    currentMessages: ChatMessage[],
    systemPrompt?: string,
    maxToolRounds: number = 5,
  ) => {
    const tools = toolsRef.current;
    const llamaTools = tools ? buildToolDefs(tools) : undefined;
    let roundMessages = [...currentMessages];
    let round = 0;

    while (round < maxToolRounds) {
      round++;
      const llamaMessages = convertToLlamaMessages(roundMessages, systemPrompt);
      const assistantId = generateMsgId();

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantId),
        { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: '' }] },
      ]);

      const abortController = new AbortController();
      abortRef.current = abortController;

      let streamedText = '';
      try {
        const response = await streamChatCompletion(
          configRef.current,
          llamaMessages,
          llamaTools,
          (chunk) => {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              streamedText += delta.content;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.findIndex((m) => m.id === assistantId);
                if (lastIdx >= 0) {
                  const textPartIdx = updated[lastIdx].parts.findIndex((p) => p.type === 'text');
                  if (textPartIdx >= 0) {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      parts: updated[lastIdx].parts.map((p, i) =>
                        i === textPartIdx ? { ...p, text: streamedText } : p,
                      ),
                    };
                  }
                }
                return updated;
              });
            }
          },
          abortController.signal,
        );

        abortRef.current = null;

        if (response.tool_calls && response.tool_calls.length > 0 && tools) {
          const toolParts: MessagePart[] = [];
          const toolResults: LlamaChatMessage[] = [];

          for (const tc of response.tool_calls) {
            const toolName = tc.function.name;
            const toolDef = tools[toolName];
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(tc.function.arguments);
            } catch {
              console.log('[LLAMA] Failed to parse tool args:', tc.function.arguments);
            }

            const toolPart: MessagePart = {
              type: 'tool',
              toolName,
              state: 'input-available',
              input: parsedInput,
            };
            toolParts.push(toolPart);

            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m.id === assistantId);
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  parts: [
                    ...updated[idx].parts.filter((p) => p.type === 'text' && p.text),
                    ...toolParts,
                  ],
                };
              }
              return updated;
            });

            if (toolDef?.execute) {
              try {
                console.log('[LLAMA] Executing tool:', toolName);
                const result = await toolDef.execute(parsedInput);
                const outputStr = result ?? 'Tool executed successfully';
                toolPart.state = 'output-available';
                toolPart.output = outputStr;

                toolResults.push({
                  role: 'tool',
                  content: outputStr,
                  tool_call_id: tc.id,
                  name: toolName,
                });
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : 'Tool execution failed';
                toolPart.state = 'output-error';
                toolPart.errorText = errMsg;

                toolResults.push({
                  role: 'tool',
                  content: `Error: ${errMsg}`,
                  tool_call_id: tc.id,
                  name: toolName,
                });
              }
            } else {
              toolPart.state = 'output-available';
              toolPart.output = 'Tool has no execute handler';
              toolResults.push({
                role: 'tool',
                content: 'Tool has no execute handler',
                tool_call_id: tc.id,
                name: toolName,
              });
            }
          }

          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === assistantId);
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                parts: [
                  ...updated[idx].parts.filter((p) => p.type === 'text' && p.text),
                  ...toolParts,
                ],
              };
            }
            return updated;
          });

          roundMessages = messages.concat([
            {
              id: assistantId,
              role: 'assistant',
              parts: [
                { type: 'text', text: response.content ?? '' },
                ...toolParts,
              ],
            },
          ]);

          continue;
        }

        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantId);
          if (idx >= 0) {
            const finalText = response.content || streamedText;
            const existingToolParts = updated[idx].parts.filter((p) => p.type === 'tool');
            updated[idx] = {
              ...updated[idx],
              parts: [
                ...(finalText ? [{ type: 'text' as const, text: finalText }] : []),
                ...existingToolParts,
              ],
            };
          }
          return updated;
        });

        break;
      } catch (e) {
        abortRef.current = null;
        if (e instanceof DOMException && e.name === 'AbortError') {
          console.log('[LLAMA] Request aborted');
          break;
        }
        console.log('[LLAMA] Completion error:', e);
        setError(e instanceof Error ? e : new Error(String(e)));

        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantId);
          if (idx >= 0) {
            updated.splice(idx, 1);
          }
          return updated;
        });
        break;
      }
    }
  }, [messages]);

  const sendMessage = useCallback((payload: {
    text: string;
    systemPrompt?: string;
    files?: Array<{ type: string; mimeType: string; uri: string }>;
  }) => {
    setError(null);

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const userMessage: ChatMessage = {
      id: generateMsgId(),
      role: 'user',
      parts: [{ type: 'text', text: payload.text }],
    };

    setMessages((prev) => {
      const updated = [...prev, userMessage];
      void runCompletion(updated, payload.systemPrompt);
      return updated;
    });
  }, [runCompletion]);

  const setMessagesExternal = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return {
    messages,
    sendMessage,
    setMessages: setMessagesExternal,
    error,
  };
}
