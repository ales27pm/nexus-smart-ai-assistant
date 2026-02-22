import { generateId } from "@/utils/memory";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
};

export function appendUserAndAssistantPlaceholder(
  baseMessages: ChatMessage[],
  userText: string,
) {
  const userMessage: ChatMessage = {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: userText }],
  };

  const assistantId = generateId();
  const assistantPlaceholder: ChatMessage = {
    id: assistantId,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
  };

  return {
    thread: [...baseMessages, userMessage, assistantPlaceholder],
    assistantId,
  };
}
