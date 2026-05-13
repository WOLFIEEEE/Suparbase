"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

interface TranscriptStep {
  tool: string;
  args: unknown;
  result: unknown;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  transcript?: TranscriptStep[];
  model?: string;
}

interface ChatResponse {
  answer: string;
  model: string;
  transcript: TranscriptStep[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

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
          className="!w-full sm:!max-w-md md:!max-w-lg p-0 gap-0"
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

function ChatPanel({ onClose }: { onClose: () => void }) {
  const connectionId = useCurrentConnectionId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation<ChatResponse, AppError, ChatMessage[]>({
    mutationFn: async (history) => {
      const res = await fetch(`/api/ai/chat/${encodeURIComponent(connectionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) {
        throw new AppError(
          (json.category as AppError["category"] | undefined) ?? "server",
          (json.message as string | undefined) ?? "Chat failed.",
        );
      }
      return json as unknown as ChatResponse;
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mutation.isPending]);

  const send = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || mutation.isPending) return;
      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      mutation.mutate(next, {
        onSuccess: (data) => {
          setMessages((cur) => [
            ...cur,
            {
              role: "assistant",
              content: data.answer,
              transcript: data.transcript,
              model: data.model,
            },
          ]);
        },
      });
    },
    [messages, mutation],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b hairline px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="font-display text-base">AI assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              disabled={mutation.isPending}
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

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          <ul className="space-y-4">
            {messages.map((m, i) => (
              <li key={i}>
                <MessageBubble msg={m} />
              </li>
            ))}
            {mutation.isPending && (
              <li>
                <ThinkingBubble />
              </li>
            )}
            {mutation.isError && (
              <li>
                <ErrorBubble error={mutation.error} />
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        className="shrink-0 border-t hairline bg-bg-raised/40 p-3"
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
            className="min-h-[44px] resize-none"
            disabled={mutation.isPending}
            aria-label="Chat message"
          />
          <Button
            type="submit"
            size="md"
            disabled={!input.trim() || mutation.isPending}
            aria-label="Send"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-fg-faint">
          Read-only. Uses your OpenRouter key & schema analysis.
        </p>
      </form>
    </div>
  );
}

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
              className="w-full rounded-md border hairline bg-bg-raised px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-fg">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msg.transcript && msg.transcript.length > 0 && (
        <TranscriptTrace steps={msg.transcript} />
      )}
      <div className="flex">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border hairline bg-bg-raised px-3.5 py-2 text-sm text-fg">
          {msg.content}
        </div>
      </div>
      {msg.model && (
        <p className="px-1 text-[10px] text-fg-faint">via {msg.model}</p>
      )}
    </div>
  );
}

function TranscriptTrace({ steps }: { steps: TranscriptStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border hairline bg-bg-sunken/40 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-fg-muted hover:text-fg"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        <Wrench className="h-3 w-3" aria-hidden />
        <span>
          {steps.length} tool {steps.length === 1 ? "call" : "calls"}
        </span>
        <span className="ml-auto truncate font-mono text-fg-faint">
          {steps.map((s) => s.tool).join(" → ")}
        </span>
      </button>
      {open && (
        <ol className="space-y-2 border-t hairline px-2.5 py-2">
          {steps.map((s, i) => (
            <li key={i} className="space-y-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-fg">{s.tool}</span>
                <span className="text-fg-faint">{summarizeArgs(s.args)}</span>
              </div>
              <div className="font-mono text-fg-muted">
                → {summarizeResult(s.result)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.table_name === "string") parts.push(a.table_name);
  if (typeof a.category === "string") parts.push(`category=${a.category}`);
  if (Array.isArray(a.filters) && a.filters.length > 0) {
    parts.push(`${a.filters.length} filter${a.filters.length === 1 ? "" : "s"}`);
  }
  if (typeof a.limit === "number") parts.push(`limit ${a.limit}`);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if (typeof r.error === "string") return `error: ${r.error}`;
  if (typeof r.count === "number") return `count = ${r.count}`;
  if (typeof r.returned === "number") return `returned ${r.returned} row${r.returned === 1 ? "" : "s"}`;
  if (Array.isArray(r.tables)) return `${(r.tables as unknown[]).length} table${(r.tables as unknown[]).length === 1 ? "" : "s"}`;
  if (Array.isArray(r.columns)) return `${(r.columns as unknown[]).length} columns`;
  return "ok";
}

function ThinkingBubble() {
  return (
    <div className="flex">
      <div className="space-y-1.5 rounded-2xl rounded-bl-sm border hairline bg-bg-raised px-3.5 py-2.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

function ErrorBubble({ error }: { error: AppError }) {
  const isMissingKey = error.category === "no_key";
  return (
    <div className="space-y-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-danger">
        <span className="font-medium">Couldn't answer</span>
        <span className="text-fg-muted">· {error.category}</span>
      </div>
      <p className="text-fg-muted">{error.message}</p>
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
