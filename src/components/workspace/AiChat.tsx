"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Hash,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Square,
  Table2,
  Wrench,
  X,
} from "lucide-react";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/ui/cn";

// ---------------------------------------------------------------------------
// Event types — must mirror src/server/ai/chat.ts ChatEvent
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ToolStep[];
  model?: string;
  error?: { category: string; message: string };
  /** Set while the assistant message is still streaming. */
  pending?: boolean;
  phase?: Phase;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: "user_send"; content: string }
  | { type: "assistant_begin" }
  | { type: "phase"; phase: Phase }
  | { type: "tool_start"; id: string; tool: string; args: unknown }
  | { type: "tool_end"; id: string; tool: string; result: unknown }
  | { type: "text"; delta: string }
  | { type: "done"; model: string }
  | { type: "error"; category: string; message: string }
  | { type: "reset" }
  | { type: "stop" };

interface State {
  messages: ChatMessage[];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "user_send":
      return { messages: [...state.messages, { role: "user", content: action.content }] };
    case "assistant_begin":
      return {
        messages: [
          ...state.messages,
          { role: "assistant", content: "", steps: [], pending: true, phase: "thinking" },
        ],
      };
    case "phase":
      return mapLastAssistant(state, (m) => ({ ...m, phase: action.phase }));
    case "tool_start":
      return mapLastAssistant(state, (m) => ({
        ...m,
        steps: [
          ...(m.steps ?? []),
          { id: action.id, tool: action.tool, args: action.args, status: "running" },
        ],
      }));
    case "tool_end":
      return mapLastAssistant(state, (m) => ({
        ...m,
        steps: (m.steps ?? []).map((s) =>
          s.id === action.id ? { ...s, result: action.result, status: "done" } : s,
        ),
      }));
    case "text":
      return mapLastAssistant(state, (m) => ({ ...m, content: m.content + action.delta }));
    case "done":
      return mapLastAssistant(state, (m) => ({
        ...m,
        pending: false,
        phase: undefined,
        model: action.model,
      }));
    case "error":
      return mapLastAssistant(state, (m) => ({
        ...m,
        pending: false,
        phase: undefined,
        error: { category: action.category, message: action.message },
      }));
    case "stop":
      return mapLastAssistant(state, (m) =>
        m.pending
          ? {
              ...m,
              pending: false,
              phase: undefined,
              content: m.content || "(stopped)",
            }
          : m,
      );
    case "reset":
      return { messages: [] };
    default:
      return state;
  }
}

function mapLastAssistant(state: State, fn: (m: ChatMessage) => ChatMessage): State {
  if (state.messages.length === 0) return state;
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "assistant") return state;
  return {
    messages: [...state.messages.slice(0, -1), fn(last)],
  };
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
          className="!w-full sm:!max-w-md md:!max-w-lg !p-0 !gap-0 !overflow-hidden"
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
  const [state, dispatch] = useReducer(reducer, { messages: [] });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new content (use the actual content length to avoid
  // re-render thrash; smooth for human-typed updates, instant for streams).
  const lastMessage = state.messages[state.messages.length - 1];
  const scrollKey = `${state.messages.length}:${lastMessage?.content.length ?? 0}:${lastMessage?.steps?.length ?? 0}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scrollKey]);

  // Abort any in-flight stream when the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || pending) return;
      setInput("");
      setPending(true);

      dispatch({ type: "user_send", content: trimmed });
      dispatch({ type: "assistant_begin" });

      const history = [
        ...state.messages
          .filter((m) => !m.error && m.content)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: trimmed },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/ai/chat/${encodeURIComponent(connectionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
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
    [connectionId, pending, state.messages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "stop" });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b hairline bg-bg/95 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-accent/15">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          </div>
          <div className="leading-tight">
            <h2 className="font-display text-sm">AI assistant</h2>
            <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
              read-only · tool-use
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {state.messages.length > 0 && !pending && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: "reset" })}
            >
              Clear
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

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        {state.messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          <ul className="space-y-4">
            {state.messages.map((m, i) => (
              <li key={i}>
                <MessageBubble msg={m} />
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
            placeholder="Ask anything about your data…"
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
          Read-only. Uses your OpenRouter key &amp; schema analysis.
        </p>
      </form>
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
      dispatch({ type: "done", model: ev.model });
      return;
    case "error":
      dispatch({ type: "error", category: ev.category, message: ev.message });
      return;
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
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
        {STARTERS.map((s) => (
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

function MessageBubble({ msg }: { msg: ChatMessage }) {
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
          <div className="max-w-[88%] rounded-2xl rounded-bl-sm border hairline bg-bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-fg shadow-sm">
            {msg.content ? (
              <span className="whitespace-pre-wrap">
                {msg.content}
                {msg.pending && msg.phase === "answering" && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] -mb-[2px] animate-pulse bg-accent align-baseline" />
                )}
              </span>
            ) : (
              <PhaseIndicator phase={msg.phase} />
            )}
          </div>
        </div>
      ) : null}
      {msg.model && !msg.pending && (
        <p className="px-1 text-[10px] text-fg-faint">via {msg.model}</p>
      )}
    </div>
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
  if (name === "count_rows")
    return <Hash className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
  return <Wrench className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.table_name === "string") parts.push(a.table_name);
  if (typeof a.category === "string" && a.category !== "all") parts.push(`category=${a.category}`);
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
  if (Array.isArray(r.tables))
    return `${(r.tables as unknown[]).length} table${(r.tables as unknown[]).length === 1 ? "" : "s"}`;
  if (Array.isArray(r.columns))
    return `${(r.columns as unknown[]).length} column${(r.columns as unknown[]).length === 1 ? "" : "s"}`;
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
