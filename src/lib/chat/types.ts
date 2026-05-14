/**
 * Shape persisted to localStorage. Mirrors the runtime ChatMessage in
 * AiChat.tsx but without callbacks or transient flags (pending, phase).
 */

export interface ChatStoreStep {
  id: string;
  tool: string;
  args: unknown;
  result?: unknown;
  status: "running" | "done";
}

export interface ChatStoreProposal {
  id: string;
  proposal: unknown;
  status: "pending" | "applying" | "applied" | "discarded" | "failed";
  error?: string;
  appliedCount?: number;
}

export interface ChatStoreMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ChatStoreStep[];
  proposals?: ChatStoreProposal[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
