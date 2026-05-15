/**
 * Per-connection conversation storage in localStorage. Schema v2.
 *
 * Key shape:
 *   suparbase.chat.<connId>.v2.conversations  → JSON array of Conversation
 *   suparbase.chat.<connId>.v2.active         → string (current conversation id)
 *
 * We never store callbacks or tool execution functions; we only store the
 * serialisable state required to render a conversation when it's reopened.
 */

import type { ChatStoreMessage } from "./types";

const SCHEMA = "v2";
const MAX_CONVERSATIONS = 50;
const TITLE_MAX = 60;

export interface Conversation {
  id: string;
  title: string;
  /** ms since epoch */
  createdAt: number;
  updatedAt: number;
  messages: ChatStoreMessage[];
  /** Cumulative token usage across the whole conversation. */
  totalTokens: number;
  /** Model used for the last turn, if known. */
  lastModel?: string;
}

interface Bag {
  conversations: Conversation[];
  activeId: string | null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function key(connectionId: string, suffix: string): string {
  return `suparbase.chat.${connectionId}.${SCHEMA}.${suffix}`;
}

export function loadBag(connectionId: string): Bag {
  if (!isBrowser()) return { conversations: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(key(connectionId, "conversations"));
    const active = window.localStorage.getItem(key(connectionId, "active"));
    const list = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return { conversations: list, activeId: active || null };
  } catch {
    return { conversations: [], activeId: null };
  }
}

export function saveBag(connectionId: string, bag: Bag): void {
  if (!isBrowser()) return;
  try {
    const trimmed = bag.conversations.slice(0, MAX_CONVERSATIONS);
    window.localStorage.setItem(key(connectionId, "conversations"), JSON.stringify(trimmed));
    if (bag.activeId) {
      window.localStorage.setItem(key(connectionId, "active"), bag.activeId);
    } else {
      window.localStorage.removeItem(key(connectionId, "active"));
    }
  } catch {
    /* localStorage full / private mode, fail silently */
  }
}

export function newConversation(): Conversation {
  return {
    id: makeId(),
    title: "New conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    totalTokens: 0,
  };
}

export function makeId(): string {
  // Simple, unique-enough id. Doesn't need to be globally unique.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Derive a one-line title from the first user message. Truncates politely.
 */
export function deriveTitle(messages: ChatStoreMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.replace(/\s+/g, " ").trim();
  if (text.length <= TITLE_MAX) return text;
  return text.slice(0, TITLE_MAX - 1) + "…";
}

export function relativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86_400);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Strip non-serialisable bits from a runtime message before persisting.
 * The runtime ChatMessage in AiChat.tsx carries an `error` object and a
 * `pending` flag we don't want to persist; this normalises into a clean
 * `ChatStoreMessage`.
 */
export function serializeMessage(m: {
  role: "user" | "assistant";
  content: string;
  steps?: Array<{ id: string; tool: string; args: unknown; result?: unknown; status: "running" | "done" }>;
  proposals?: Array<{
    id: string;
    proposal: unknown;
    status: "pending" | "applying" | "applied" | "discarded" | "failed";
    error?: string;
    appliedCount?: number;
  }>;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): ChatStoreMessage {
  return {
    role: m.role,
    content: m.content,
    steps: (m.steps ?? []).map((s) => ({
      id: s.id,
      tool: s.tool,
      args: s.args,
      result: s.result,
      // After persistence, all steps are "done", running state is transient.
      status: "done",
    })),
    proposals: (m.proposals ?? []).map((p) => ({
      id: p.id,
      proposal: p.proposal,
      status: p.status === "applying" ? "pending" : p.status,
      error: p.error,
      appliedCount: p.appliedCount,
    })),
    model: m.model,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    totalTokens: m.totalTokens,
  };
}

export function exportAsMarkdown(conv: Conversation): string {
  const lines: string[] = [];
  lines.push(`# ${conv.title}`, "");
  lines.push(
    `_Started ${new Date(conv.createdAt).toLocaleString()} · ${conv.messages.length} messages · ${conv.totalTokens.toLocaleString()} tokens_`,
    "",
  );
  for (const m of conv.messages) {
    lines.push(m.role === "user" ? "## You" : "## Assistant", "");
    lines.push(m.content || "_(empty)_", "");
    if (m.steps && m.steps.length > 0) {
      lines.push(`_Tool calls: ${m.steps.map((s) => s.tool).join(" → ")}_`, "");
    }
    if (m.proposals && m.proposals.length > 0) {
      for (const p of m.proposals) {
        lines.push(
          `> Proposal · ${p.status}${p.appliedCount != null ? ` (${p.appliedCount} rows)` : ""}`,
          "> ```json",
          `> ${JSON.stringify(p.proposal, null, 2).split("\n").join("\n> ")}`,
          "> ```",
          "",
        );
      }
    }
  }
  return lines.join("\n");
}
