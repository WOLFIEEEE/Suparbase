"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Hash,
  Loader2,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Square,
  Table2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import {
  type Conversation,
  deriveTitle,
  exportAsMarkdown,
  loadBag,
  newConversation,
  saveBag,
  serializeMessage,
} from "@/lib/chat/storage";
import type { ChatStoreMessage } from "@/lib/chat/types";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatConversationSidebar } from "./ChatConversationSidebar";

// ---------------------------------------------------------------------------
// Event types: must mirror src/server/ai/chat.ts ChatEvent
// ---------------------------------------------------------------------------

type Phase = "thinking" | "tool_running" | "answering";

type ChatEvent =
  | { type: "phase"; phase: Phase }
  | { type: "tool_start"; id: string; tool: string; args: unknown }
  | { type: "tool_end"; id: string; tool: string; result: unknown }
  | { type: "text"; delta: string }
  | {
      type: "done";
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | { type: "error"; category: string; message: string };

interface ToolStep {
  id: string;
  tool: string;
  args: unknown;
  result?: unknown;
  status: "running" | "done";
}

interface FilterShape {
  column: string;
  op: string;
  value: unknown;
}

interface UpdateProposal {
  kind: "proposed_update";
  table: string;
  schema?: string;
  summary: string;
  filters: FilterShape[];
  patch: Record<string, unknown>;
  preview: Array<Record<string, unknown>>;
  totalCount: number | null;
}

interface InsertProposal {
  kind: "proposed_insert";
  table: string;
  schema?: string;
  summary: string;
  values: Record<string, unknown>;
}

interface DeleteProposal {
  kind: "proposed_delete";
  table: string;
  schema?: string;
  summary: string;
  filters: FilterShape[];
  preview: Array<Record<string, unknown>>;
  totalCount: number | null;
}

type Proposal = UpdateProposal | InsertProposal | DeleteProposal;

type ProposalStatus = "pending" | "applying" | "applied" | "discarded" | "failed";

interface ProposalEntry {
  id: string;
  proposal: Proposal;
  status: ProposalStatus;
  error?: string;
  appliedCount?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ToolStep[];
  proposals?: ProposalEntry[];
  model?: string;
  error?: { category: string; message: string };
  pending?: boolean;
  phase?: Phase;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

// ---------------------------------------------------------------------------
// Reducer, operates on the full bag of conversations
// ---------------------------------------------------------------------------

type Action =
  | { type: "load"; conversations: Conversation[]; activeId: string | null }
  | { type: "new" }
  | { type: "select"; id: string }
  | { type: "delete"; id: string }
  | { type: "user_send"; content: string }
  | { type: "assistant_begin" }
  | { type: "phase"; phase: Phase }
  | { type: "tool_start"; id: string; tool: string; args: unknown }
  | { type: "tool_end"; id: string; tool: string; result: unknown }
  | { type: "text"; delta: string }
  | {
      type: "done";
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | { type: "error"; category: string; message: string }
  | {
      type: "proposal_status";
      id: string;
      status: ProposalStatus;
      error?: string;
      appliedCount?: number;
    }
  | { type: "stop" };

interface State {
  conversations: Array<Conversation & { runtimeMessages?: ChatMessage[] }>;
  activeId: string | null;
}

function hydrateMessages(stored: ChatStoreMessage[]): ChatMessage[] {
  return stored.map((m) => ({
    role: m.role,
    content: m.content,
    steps: m.steps as ToolStep[] | undefined,
    proposals: m.proposals as ProposalEntry[] | undefined,
    model: m.model,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    totalTokens: m.totalTokens,
  }));
}

function activeIndex(s: State): number {
  if (!s.activeId) return -1;
  return s.conversations.findIndex((c) => c.id === s.activeId);
}

function updateActive(
  s: State,
  fn: (c: Conversation & { runtimeMessages?: ChatMessage[] }) => Conversation & {
    runtimeMessages?: ChatMessage[];
  },
): State {
  const idx = activeIndex(s);
  if (idx < 0) return s;
  const next = s.conversations.slice();
  next[idx] = fn(next[idx]);
  return { ...s, conversations: next };
}

function updateLastAssistant(s: State, fn: (m: ChatMessage) => ChatMessage): State {
  return updateActive(s, (c) => {
    const msgs = (c.runtimeMessages ?? hydrateMessages(c.messages)).slice();
    if (msgs.length === 0) return c;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") return c;
    msgs[msgs.length - 1] = fn(last);
    return { ...c, runtimeMessages: msgs, updatedAt: Date.now() };
  });
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return {
        conversations: action.conversations.map((c) => ({
          ...c,
          runtimeMessages: hydrateMessages(c.messages),
        })),
        activeId: action.activeId,
      };

    case "new": {
      const conv = newConversation();
      const wrapped = { ...conv, runtimeMessages: [] as ChatMessage[] };
      return {
        conversations: [wrapped, ...state.conversations],
        activeId: conv.id,
      };
    }

    case "select":
      return { ...state, activeId: action.id };

    case "delete": {
      const remaining = state.conversations.filter((c) => c.id !== action.id);
      const wasActive = state.activeId === action.id;
      return {
        conversations: remaining,
        activeId: wasActive ? remaining[0]?.id ?? null : state.activeId,
      };
    }

    case "user_send":
      return updateActive(state, (c) => {
        const msgs = c.runtimeMessages ?? hydrateMessages(c.messages);
        const next = [...msgs, { role: "user" as const, content: action.content }];
        const title =
          c.messages.length === 0 && c.title === "New conversation"
            ? deriveTitle([{ role: "user", content: action.content }])
            : c.title;
        return { ...c, title, runtimeMessages: next, updatedAt: Date.now() };
      });

    case "assistant_begin":
      return updateActive(state, (c) => {
        const msgs = c.runtimeMessages ?? hydrateMessages(c.messages);
        return {
          ...c,
          runtimeMessages: [
            ...msgs,
            {
              role: "assistant",
              content: "",
              steps: [],
              pending: true,
              phase: "thinking",
            },
          ],
          updatedAt: Date.now(),
        };
      });

    case "phase":
      return updateLastAssistant(state, (m) => ({ ...m, phase: action.phase }));

    case "tool_start":
      return updateLastAssistant(state, (m) => ({
        ...m,
        steps: [
          ...(m.steps ?? []),
          { id: action.id, tool: action.tool, args: action.args, status: "running" },
        ],
      }));

    case "tool_end":
      return updateLastAssistant(state, (m) => {
        const updatedSteps = (m.steps ?? []).map((s) =>
          s.id === action.id ? { ...s, result: action.result, status: "done" as const } : s,
        );
        const proposal = toProposal(action.result);
        const proposals = proposal
          ? [
              ...(m.proposals ?? []),
              { id: action.id, proposal, status: "pending" as const },
            ]
          : m.proposals;
        return { ...m, steps: updatedSteps, proposals };
      });

    case "proposal_status":
      return updateLastAssistant(state, (m) => ({
        ...m,
        proposals: (m.proposals ?? []).map((p) =>
          p.id === action.id
            ? { ...p, status: action.status, error: action.error, appliedCount: action.appliedCount }
            : p,
        ),
      }));

    case "text":
      return updateLastAssistant(state, (m) => ({ ...m, content: m.content + action.delta }));

    case "done": {
      const { model, usage } = action;
      const next = updateLastAssistant(state, (m) => ({
        ...m,
        pending: false,
        phase: undefined,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      }));
      // Roll up cumulative tokens onto the conversation.
      return updateActive(next, (c) => ({
        ...c,
        totalTokens: c.totalTokens + (usage.totalTokens ?? 0),
        lastModel: model,
      }));
    }

    case "error":
      return updateLastAssistant(state, (m) => ({
        ...m,
        pending: false,
        phase: undefined,
        error: { category: action.category, message: action.message },
      }));

    case "stop":
      return updateLastAssistant(state, (m) =>
        m.pending
          ? {
              ...m,
              pending: false,
              phase: undefined,
              content: m.content || "(stopped)",
            }
          : m,
      );

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Page context, give the agent a hint about where the user is
// ---------------------------------------------------------------------------

interface PageContext {
  pathname?: string;
  tableName?: string;
  view?: string;
}

function detectPageContext(pathname: string | null): PageContext | undefined {
  if (!pathname) return undefined;
  const tableMatch = /^\/c\/[^/]+\/tables\/([^/?#]+)(?:\/([^/?#]+))?/.exec(pathname);
  if (tableMatch) {
    const tableName = decodeURIComponent(tableMatch[1] ?? "");
    const sub = tableMatch[2];
    const view =
      sub === "new" ? "new-row" : sub ? "row-detail" : "table-list";
    return { pathname, tableName, view };
  }
  const viewMatch = /^\/c\/[^/]+\/(rls|storage|schema|auth-users|sql|settings)/.exec(pathname);
  if (viewMatch) {
    return { pathname, view: viewMatch[1] };
  }
  return { pathname };
}

// ---------------------------------------------------------------------------
// Floating launcher + drawer
// ---------------------------------------------------------------------------

const STARTERS = [
  "How many users do we have?",
  "Show me the 5 most recent orders.",
  "Which tables track user activity?",
];

export function AiChat() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg shadow-lg",
          "transition-transform hover:scale-[1.02] hover:bg-accent/90 active:scale-[0.98]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        )}
        aria-label="Ask AI"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          side="right"
          hideClose
          className="!w-full sm:!max-w-2xl md:!max-w-3xl !p-0 !gap-0 !overflow-hidden"
        >
          <DialogTitle className="sr-only">AI assistant</DialogTitle>
          <DialogDescription className="sr-only">
            Ask questions about your database. The assistant reads tables read-only.
          </DialogDescription>
          <ChatPanel onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

function ChatPanel({ onClose }: { onClose: () => void }) {
  const connectionId = useCurrentConnectionId();
  const pathname = usePathname();
  const pageCtx = useMemo(() => detectPageContext(pathname), [pathname]);
  const [state, dispatch] = useReducer(reducer, { conversations: [], activeId: null });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const hydrated = useRef(false);

  // Load from localStorage when the connection changes.
  useEffect(() => {
    if (!connectionId) return;
    const bag = loadBag(connectionId);
    if (bag.conversations.length === 0) {
      const conv = newConversation();
      dispatch({ type: "load", conversations: [conv], activeId: conv.id });
    } else {
      dispatch({
        type: "load",
        conversations: bag.conversations,
        activeId: bag.activeId ?? bag.conversations[0]?.id ?? null,
      });
    }
    hydrated.current = true;
  }, [connectionId]);

  // Persist on every state change once hydrated.
  useEffect(() => {
    if (!hydrated.current || !connectionId) return;
    const toPersist: Conversation[] = state.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      totalTokens: c.totalTokens,
      lastModel: c.lastModel,
      messages: (c.runtimeMessages ?? hydrateMessages(c.messages)).map(serializeMessage),
    }));
    saveBag(connectionId, { conversations: toPersist, activeId: state.activeId });
  }, [connectionId, state]);

  const active = state.conversations.find((c) => c.id === state.activeId);
  const messages: ChatMessage[] = active
    ? active.runtimeMessages ?? hydrateMessages(active.messages)
    : [];

  const applyProposal = useCallback(
    async (entry: ProposalEntry) => {
      if (entry.status === "applying" || entry.status === "applied") return;
      dispatch({ type: "proposal_status", id: entry.id, status: "applying" });
      try {
        const res = await fetch(
          `/api/ai/chat/${encodeURIComponent(connectionId)}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry.proposal),
          },
        );
        const text = await res.text();
        const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        if (!res.ok) {
          throw new AppError(
            (data.category as AppError["category"] | undefined) ?? "server",
            (data.message as string | undefined) ?? "Apply failed.",
          );
        }
        const applied = typeof data.applied === "number" ? data.applied : 0;
        dispatch({
          type: "proposal_status",
          id: entry.id,
          status: "applied",
          appliedCount: applied,
        });
        toast.success(
          `Applied to ${entry.proposal.table}: ${applied} row${applied === 1 ? "" : "s"}.`,
        );
        qc.invalidateQueries({
          queryKey: ["rows", connectionId, "public", entry.proposal.table],
        });
        qc.invalidateQueries({
          queryKey: ["rowCount", connectionId, "public", entry.proposal.table],
        });
        qc.invalidateQueries({
          queryKey: ["row", connectionId, "public", entry.proposal.table],
        });
      } catch (e) {
        const app = e instanceof AppError ? e : new AppError("client_bug", (e as Error).message);
        dispatch({
          type: "proposal_status",
          id: entry.id,
          status: "failed",
          error: app.message,
        });
        toast.error(`Apply failed: ${app.message}`);
      }
    },
    [connectionId, qc],
  );

  const discardProposal = useCallback((entry: ProposalEntry) => {
    dispatch({ type: "proposal_status", id: entry.id, status: "discarded" });
  }, []);

  // Auto-scroll on new content
  const lastMessage = messages[messages.length - 1];
  const scrollKey = `${state.activeId}:${messages.length}:${lastMessage?.content.length ?? 0}:${lastMessage?.steps?.length ?? 0}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scrollKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || pending) return;
      setInput("");
      setPending(true);

      const history = [
        ...messages
          .filter((m) => !m.error && m.content)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: trimmed },
      ];

      dispatch({ type: "user_send", content: trimmed });
      dispatch({ type: "assistant_begin" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/ai/chat/${encodeURIComponent(connectionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, page: pageCtx }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let category = "server";
          let message = `HTTP ${res.status}`;
          try {
            const j = (await res.json()) as { category?: string; message?: string };
            if (j.category) category = j.category;
            if (j.message) message = j.message;
          } catch {
            /* ignore */
          }
          dispatch({ type: "error", category, message });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let ev: ChatEvent;
            try {
              ev = JSON.parse(line) as ChatEvent;
            } catch {
              continue;
            }
            applyEvent(ev, dispatch);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          dispatch({
            type: "error",
            category: "network",
            message: (e as Error).message ?? "Connection dropped.",
          });
        }
      } finally {
        abortRef.current = null;
        setPending(false);
      }
    },
    [connectionId, pending, messages, pageCtx],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "stop" });
  }, []);

  const onExportActive = () => {
    if (!active) return;
    const persisted: Conversation = {
      id: active.id,
      title: active.title,
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
      totalTokens: active.totalTokens,
      lastModel: active.lastModel,
      messages: messages.map(serializeMessage),
    };
    const md = exportAsMarkdown(persisted);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/[^\w\d-]+/g, "-").slice(0, 40) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 bg-bg">
      {sidebarOpen && (
        <ChatConversationSidebar
          conversations={state.conversations}
          activeId={state.activeId}
          onSelect={(id) => dispatch({ type: "select", id })}
          onNew={() => dispatch({ type: "new" })}
          onDelete={(id) => dispatch({ type: "delete", id })}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b hairline bg-bg/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded p-1.5 text-fg-muted hover:bg-bg-raised hover:text-fg"
              aria-label="Toggle conversations"
              title="Toggle conversations"
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
            </div>
            <div className="min-w-0 leading-tight">
              <h2 className="truncate font-display text-sm">{active?.title ?? "AI assistant"}</h2>
              <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                {pageCtx?.tableName ? (
                  <>context · {pageCtx.tableName}</>
                ) : (
                  <>read-only · tool-use</>
                )}
                {active && active.totalTokens > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-fg-faint">
                    · {active.totalTokens.toLocaleString()} tokens
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {active && messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onExportActive}>
                Export
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-fg-muted hover:bg-bg-raised hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions text"
          aria-label="AI assistant conversation"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={send} pageCtx={pageCtx} />
          ) : (
            <ul className="space-y-4">
              {messages.map((m, i) => (
                <li key={i} className="min-w-0">
                  <MessageBubble
                    msg={m}
                    onApply={applyProposal}
                    onDiscard={discardProposal}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          className="shrink-0 border-t hairline bg-bg-raised/30 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={
                pageCtx?.tableName
                  ? `Ask about ${pageCtx.tableName}…`
                  : "Ask anything about your data…"
              }
              rows={2}
              className="min-h-[44px] resize-none !font-sans"
              disabled={pending}
              aria-label="Chat message"
            />
            {pending ? (
              <Button
                type="button"
                size="md"
                variant="secondary"
                onClick={stop}
                aria-label="Stop"
              >
                <Square className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : (
              <Button
                type="submit"
                size="md"
                disabled={!input.trim()}
                aria-label="Send"
              >
                <Send className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-fg-faint">
            Read-only by default · proposes writes for review · history saved locally.
          </p>
        </form>
      </div>
    </div>
  );
}

function applyEvent(ev: ChatEvent, dispatch: React.Dispatch<Action>) {
  switch (ev.type) {
    case "phase":
      dispatch({ type: "phase", phase: ev.phase });
      return;
    case "tool_start":
      dispatch({ type: "tool_start", id: ev.id, tool: ev.tool, args: ev.args });
      return;
    case "tool_end":
      dispatch({ type: "tool_end", id: ev.id, tool: ev.tool, result: ev.result });
      return;
    case "text":
      dispatch({ type: "text", delta: ev.delta });
      return;
    case "done":
      dispatch({ type: "done", model: ev.model, usage: ev.usage });
      return;
    case "error":
      dispatch({ type: "error", category: ev.category, message: ev.message });
      return;
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  onPick,
  pageCtx,
}: {
  onPick: (q: string) => void;
  pageCtx?: PageContext;
}) {
  const starters = pageCtx?.tableName
    ? [
        `How many rows are in ${pageCtx.tableName}?`,
        `Show me the 5 most recent rows in ${pageCtx.tableName}.`,
        `What columns does ${pageCtx.tableName} have?`,
      ]
    : STARTERS;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/10">
        <MessageSquare className="h-5 w-5 text-accent" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base">Ask anything about your data</p>
        <p className="mx-auto max-w-xs text-xs text-fg-muted">
          The assistant lists relevant tables, inspects their columns, and reads rows
          read-only through PostgREST to answer your question.
        </p>
      </div>
      <ul className="w-full max-w-sm space-y-1.5">
        {starters.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="group flex w-full items-center gap-2 rounded-md border hairline bg-bg-raised px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <span className="text-accent">›</span>
              <span className="flex-1">{s}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
  onApply,
  onDiscard,
}: {
  msg: ChatMessage;
  onApply: (entry: ProposalEntry) => void;
  onDiscard: (entry: ProposalEntry) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm leading-relaxed text-accent-fg shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {msg.steps && msg.steps.length > 0 && (
        <ToolStrip steps={msg.steps} phase={msg.phase} pending={msg.pending ?? false} />
      )}
      {msg.error ? (
        <ErrorBubble category={msg.error.category} message={msg.error.message} />
      ) : msg.content || msg.pending ? (
        <div className="flex">
          <div className="group relative max-w-[88%] rounded-2xl rounded-bl-sm border hairline bg-bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-fg shadow-sm">
            {msg.content ? (
              <>
                <ChatMarkdown source={msg.content} />
                {msg.pending && msg.phase === "answering" && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] -mb-[2px] animate-pulse bg-accent align-baseline" />
                )}
                {!msg.pending && <CopyButton text={msg.content} />}
              </>
            ) : (
              <PhaseIndicator phase={msg.phase} />
            )}
          </div>
        </div>
      ) : null}
      {msg.proposals && msg.proposals.length > 0 && (
        <div className="min-w-0 space-y-2">
          {msg.proposals.map((p) => (
            <ProposalCard key={p.id} entry={p} onApply={onApply} onDiscard={onDiscard} />
          ))}
        </div>
      )}
      {msg.model && !msg.pending && (
        <p className="px-1 text-[10px] text-fg-faint">
          via {msg.model}
          {msg.totalTokens != null && (
            <span> · {msg.totalTokens.toLocaleString()} tokens</span>
          )}
        </p>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore */
        }
      }}
      className="absolute right-1.5 top-1.5 hidden rounded p-1.5 text-fg-faint hover:bg-bg-sunken hover:text-fg group-hover:inline-flex"
      aria-label="Copy message"
      title="Copy message"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
    </button>
  );
}

function PhaseIndicator({ phase }: { phase?: Phase }) {
  const label =
    phase === "tool_running"
      ? "Reading your database…"
      : phase === "answering"
      ? "Composing answer…"
      : "Thinking…";
  return (
    <span className="inline-flex items-center gap-2 text-fg-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
      <span className="text-xs">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tool trace
// ---------------------------------------------------------------------------

function ToolStrip({
  steps,
  phase,
  pending,
}: {
  steps: ToolStep[];
  phase?: Phase;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastStep = steps[steps.length - 1];
  const runningCount = steps.filter((s) => s.status === "running").length;
  const doneCount = steps.length - runningCount;

  return (
    <div className="rounded-md border hairline bg-bg-sunken/50 text-[11px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-fg-muted hover:text-fg"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />
        <span className="shrink-0 font-medium text-fg">
          {steps.length} tool {steps.length === 1 ? "call" : "calls"}
        </span>
        {lastStep && (
          <span className="ml-1 flex min-w-0 items-center gap-1.5 truncate">
            <ToolIcon name={lastStep.tool} />
            <code className="truncate font-mono text-fg-muted">
              {lastStep.tool}
              <span className="text-fg-faint">{summarizeArgs(lastStep.args)}</span>
            </code>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px]">
          {runningCount > 0 && pending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-accent">
              <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
              running
            </span>
          ) : (
            <span className="text-fg-faint tabular-nums">{doneCount} done</span>
          )}
        </span>
      </button>
      {expanded && (
        <ol className="space-y-2 border-t hairline px-2.5 py-2">
          {steps.map((s) => (
            <li key={s.id} className="space-y-0.5">
              <div className="flex items-baseline gap-1.5">
                <ToolIcon name={s.tool} />
                <span className="font-mono text-fg">{s.tool}</span>
                <span className="text-fg-faint">{summarizeArgs(s.args)}</span>
                {s.status === "running" && (
                  <Loader2 className="ml-auto h-3 w-3 animate-spin text-accent" aria-hidden />
                )}
              </div>
              <div className="ml-4 font-mono text-fg-muted">
                {s.status === "running" ? "…" : `→ ${summarizeResult(s.result)}`}
              </div>
            </li>
          ))}
          {phase === "tool_running" && pending && runningCount === 0 && (
            <li className="text-fg-faint">Preparing next step…</li>
          )}
        </ol>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  if (name === "list_tables")
    return <Table2 className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
  if (name === "get_table_schema")
    return <Database className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
  if (name === "count_rows" || name === "aggregate")
    return <Hash className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
  return <Wrench className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.table_name === "string") parts.push(a.table_name);
  if (typeof a.category === "string" && a.category !== "all") parts.push(`category=${a.category}`);
  if (typeof a.op === "string") parts.push(a.op as string);
  if (Array.isArray(a.filters) && a.filters.length > 0) {
    parts.push(`${a.filters.length} filter${a.filters.length === 1 ? "" : "s"}`);
  }
  if (typeof a.limit === "number") parts.push(`limit ${a.limit}`);
  return parts.length > 0 ? `(${parts.join(", ")})` : "()";
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if (typeof r.error === "string") return `error: ${r.error}`;
  if (typeof r.count === "number") return `count = ${r.count.toLocaleString()}`;
  if (typeof r.returned === "number")
    return `${r.returned} row${r.returned === 1 ? "" : "s"}`;
  if (typeof r.value === "number") return `value = ${r.value.toLocaleString()}`;
  if (Array.isArray(r.tables))
    return `${(r.tables as unknown[]).length} table${(r.tables as unknown[]).length === 1 ? "" : "s"}`;
  if (Array.isArray(r.columns))
    return `${(r.columns as unknown[]).length} column${(r.columns as unknown[]).length === 1 ? "" : "s"}`;
  if (Array.isArray(r.indexes))
    return `${(r.indexes as unknown[]).length} index${(r.indexes as unknown[]).length === 1 ? "" : "es"}`;
  if (Array.isArray(r.groups))
    return `${(r.groups as unknown[]).length} group${(r.groups as unknown[]).length === 1 ? "" : "s"}`;
  return "ok";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function ErrorBubble({ category, message }: { category: string; message: string }) {
  const isMissingKey = category === "no_key";
  return (
    <div className="space-y-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-danger">
        <span className="font-medium">Couldn&apos;t answer</span>
        <span className="text-fg-muted">· {category}</span>
      </div>
      <p className="text-fg-muted">{message}</p>
      {isMissingKey && (
        <a
          href="/settings/ai"
          className="inline-block text-accent underline-offset-2 hover:underline"
        >
          Configure key →
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal detection + Apply card
// ---------------------------------------------------------------------------

function toProposal(result: unknown): Proposal | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (
    r.kind === "proposed_update" ||
    r.kind === "proposed_insert" ||
    r.kind === "proposed_delete"
  ) {
    return r as unknown as Proposal;
  }
  return null;
}

function ProposalIcon({ kind }: { kind: Proposal["kind"] }) {
  if (kind === "proposed_update")
    return <Pencil className="h-3.5 w-3.5 text-warn" aria-hidden />;
  if (kind === "proposed_insert")
    return <Plus className="h-3.5 w-3.5 text-accent" aria-hidden />;
  return <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden />;
}

function ProposalCard({
  entry,
  onApply,
  onDiscard,
}: {
  entry: ProposalEntry;
  onApply: (entry: ProposalEntry) => void;
  onDiscard: (entry: ProposalEntry) => void;
}) {
  const { proposal, status } = entry;
  const kindLabel =
    proposal.kind === "proposed_update"
      ? "Update"
      : proposal.kind === "proposed_insert"
      ? "Insert"
      : "Delete";

  const total =
    proposal.kind === "proposed_update" || proposal.kind === "proposed_delete"
      ? proposal.totalCount ?? proposal.preview.length
      : 1;

  const isDisabled = status !== "pending";

  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-bg-raised shadow-sm",
        proposal.kind === "proposed_delete"
          ? "border-danger/40"
          : proposal.kind === "proposed_update"
          ? "border-warn/40"
          : "border-accent/40",
        status === "applied" && "opacity-90",
        status === "discarded" && "opacity-60",
      )}
    >
      <header className="flex items-center gap-2 border-b hairline px-3.5 py-2.5">
        <ProposalIcon kind={proposal.kind} />
        <span className="min-w-0 flex-1 truncate font-display text-sm">
          {kindLabel} <span className="font-mono text-fg-muted">{proposal.table}</span>
        </span>
        <span className="shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] tabular-nums text-fg-muted">
          {total} {total === 1 ? "row" : "rows"}
        </span>
      </header>
      <div className="space-y-3 px-3.5 py-3 text-xs">
        <p className="break-words text-fg">{proposal.summary}</p>

        {proposal.kind === "proposed_update" && (
          <>
            <FiltersStrip filters={proposal.filters} />
            <PatchTable patch={proposal.patch} preview={proposal.preview} />
          </>
        )}
        {proposal.kind === "proposed_delete" && (
          <>
            <FiltersStrip filters={proposal.filters} />
            <PreviewTable preview={proposal.preview} totalCount={proposal.totalCount} kind="delete" />
          </>
        )}
        {proposal.kind === "proposed_insert" && (
          <KeyValueBlock title="New row" values={proposal.values} />
        )}

        {status === "failed" && entry.error && (
          <div className="flex items-start gap-1.5 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{entry.error}</span>
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t hairline px-3.5 py-2.5">
        {status === "applied" ? (
          <div className="inline-flex items-center gap-1.5 text-[11px] text-accent">
            <Check className="h-3 w-3" aria-hidden />
            Applied
            {entry.appliedCount != null && (
              <span className="text-fg-muted">· {entry.appliedCount} row{entry.appliedCount === 1 ? "" : "s"}</span>
            )}
          </div>
        ) : status === "discarded" ? (
          <span className="text-[11px] text-fg-faint">Discarded.</span>
        ) : (
          <>
            <Button
              size="sm"
              variant={proposal.kind === "proposed_delete" ? "danger" : "primary"}
              onClick={() => onApply(entry)}
              disabled={isDisabled}
            >
              {status === "applying" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Applying…
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" aria-hidden />
                  Apply
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDiscard(entry)}
              disabled={isDisabled}
            >
              Discard
            </Button>
            <span className="basis-full text-[10px] text-fg-faint sm:ml-auto sm:basis-auto">
              Read-only by default: runs only on Apply.
            </span>
          </>
        )}
      </footer>
    </div>
  );
}

function FiltersStrip({ filters }: { filters: FilterShape[] }) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {filters.map((f, i) => (
        <code
          key={i}
          className="inline-flex max-w-full items-center gap-1 truncate rounded surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
        >
          <span className="shrink-0 text-fg">{f.column}</span>
          <span className="shrink-0 text-fg-faint">{f.op}</span>
          <span className="truncate text-fg">{prettyVal(f.value)}</span>
        </code>
      ))}
    </div>
  );
}

function PatchTable({
  patch,
  preview,
}: {
  patch: Record<string, unknown>;
  preview: Array<Record<string, unknown>>;
}) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">Changes</p>
      <ul className="space-y-1">
        {keys.map((k) => {
          const current = preview[0]?.[k];
          const next = patch[k];
          return (
            <li
              key={k}
              className="grid grid-cols-[auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 font-mono text-[11px] sm:grid-cols-[auto_1fr_auto_1fr]"
            >
              <span className="truncate text-fg-muted">{k}</span>
              <span className="min-w-0 truncate text-danger line-through" title={prettyVal(current)}>
                {prettyVal(current)}
              </span>
              <span className="hidden text-fg-faint sm:inline">→</span>
              <span className="min-w-0 truncate text-accent" title={prettyVal(next)}>
                {prettyVal(next)}
              </span>
            </li>
          );
        })}
      </ul>
      <PreviewTable preview={preview} totalCount={null} kind="update" />
    </div>
  );
}

function PreviewTable({
  preview,
  totalCount,
  kind,
}: {
  preview: Array<Record<string, unknown>>;
  totalCount: number | null;
  kind: "delete" | "update";
}) {
  if (preview.length === 0) {
    return <p className="text-[11px] text-fg-faint">No matching rows.</p>;
  }
  const remaining =
    totalCount != null && totalCount > preview.length ? totalCount - preview.length : 0;
  const allKeys = new Set<string>();
  for (const row of preview) for (const k of Object.keys(row)) allKeys.add(k);
  const visibleCols = Array.from(allKeys).slice(0, 6);
  const hiddenCols = allKeys.size - visibleCols.length;

  return (
    <details className="min-w-0 max-w-full overflow-hidden rounded border hairline bg-bg-sunken/40 text-[11px]">
      <summary className="flex cursor-pointer items-center gap-1 truncate px-2 py-1 text-fg-muted hover:text-fg">
        <span className="truncate">
          {kind === "delete" ? "Rows that would be deleted" : "Preview"}
        </span>
        <span className="ml-1 shrink-0 text-fg-faint">
          ({preview.length}
          {remaining > 0 ? ` of ${preview.length + remaining}` : ""})
        </span>
      </summary>
      <div className="max-w-full overflow-x-auto border-t hairline">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-fg-faint">
              {visibleCols.map((c) => (
                <th
                  key={c}
                  className="truncate border-b hairline px-2 py-1 font-mono text-[10px] font-normal"
                  style={{ minWidth: "5.5rem", maxWidth: "10rem" }}
                  title={c}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="align-top">
                {visibleCols.map((c) => {
                  const text = prettyVal(row[c]);
                  return (
                    <td
                      key={c}
                      className="truncate border-b hairline px-2 py-1 font-mono text-fg-muted"
                      style={{ maxWidth: "10rem" }}
                      title={text}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCols > 0 && (
        <p className="border-t hairline px-2 py-1 text-[10px] text-fg-faint">
          {hiddenCols} more {hiddenCols === 1 ? "column" : "columns"} not shown.
        </p>
      )}
    </details>
  );
}

function KeyValueBlock({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  const keys = Object.keys(values);
  if (keys.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">{title}</p>
      <ul className="space-y-1">
        {keys.map((k) => {
          const text = prettyVal(values[k]);
          return (
            <li
              key={k}
              className="grid grid-cols-[8rem_1fr] items-baseline gap-x-1.5 font-mono text-[11px]"
            >
              <span className="truncate text-fg-muted" title={k}>
                {k}
              </span>
              <span className="min-w-0 truncate text-accent" title={text}>
                = {text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function prettyVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    if (v.length > 60) return `"${v.slice(0, 60)}…"`;
    return `"${v}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  } catch {
    return String(v);
  }
}
