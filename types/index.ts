export interface MemoryEntry {
  id: string;
  content: string;
  keywords: string[];
  category: string;
  timestamp: number;
  importance: number;
  source: string;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
  messageCount: number;
}

export interface ToolExecution {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  state: 'pending' | 'running' | 'complete' | 'error';
}
