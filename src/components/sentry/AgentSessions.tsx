"use client";

/**
 * Agent Sessions, every AI mutation against your database, grouped
 * into named sessions, with one-click undo.
 *
 * UI:
 *  - Timeline of sessions in reverse-chronological order.
 *  - Each row shows agent label, mutation count, tables touched, status.
 *  - Click → drawer with the full write list (verb + table + diff).
 *  - "Undo session" button on AI sessions that haven't been undone yet.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  ChevronRight,
  Clock,
  Code2,
  Database as DatabaseIcon,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppError } from "@/lib/errors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/lib/ui/use-confirm";
import { relativeFromNow } from "@/lib/ui/time";
import type {
  AgentKind,
  SessionStatus,
  SessionSummary,
  SessionWrite,
  UndoResult,
} from "@/lib/sentry/agent-types";

interface Props {
  connectionId: string;
}

type ConnectionRole = "owner" | "editor" | "viewer";

interface SessionsData {
  sessions: SessionSummary[];
  canUndo: boolean;
  myRole: ConnectionRole;
}

interface SessionDetail {
  session: SessionSummary;
  writes: SessionWrite[];
  canUndo: boolean;
  myRole: ConnectionRole;
}

function canMutate(role: ConnectionRole | undefined): boolean {
  return role === "owner" || role === "editor";
}

async function fetchSessions(connectionId: string): Promise<SessionsData> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/sessions`);
  if (!res.ok) throw new AppError("server", "Failed to load sessions.");
  return (await res.json()) as SessionsData;
}

async function fetchDetail(connectionId: string, sessionId: string): Promise<SessionDetail> {
  const res = await fetch(
    `/api/connections/${encodeURIComponent(connectionId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) throw new AppError("server", "Failed to load session.");
  return (await res.json()) as SessionDetail;
}

export function AgentSessions({ connectionId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-sessions", connectionId],
    queryFn: () => fetchSessions(connectionId),
    refetchInterval: 30_000,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const grouped = useMemo(() => groupByAgent(data?.sessions ?? []), [data?.sessions]);

  return (
    <div className="space-y-6">
      <header className="surface relative overflow-hidden rounded-lg p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/10 to-transparent"
        />
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="font-display text-2xl leading-tight">Agent Sessions</h2>
          </div>
          <p className="max-w-prose text-sm text-fg-muted">
            Every write that flows through Suparbase&apos;s proxy is
            fingerprinted from its User-Agent and bucketed into a session.
            When an AI agent does something you didn&apos;t intend, click
            <span className="mx-1 inline-flex items-center gap-1 rounded border hairline bg-bg-sunken px-1.5 py-0.5 align-middle">
              <Undo2 className="h-3 w-3 text-accent" aria-hidden />
              Undo session
            </span>
            to atomically reverse every mutation it made.
          </p>
          {!data?.canUndo && (
            <p className="inline-flex max-w-prose items-start gap-1.5 rounded border hairline bg-bg-sunken/40 px-2.5 py-1.5 text-[11px] text-fg-faint">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                Undo needs the Direct Postgres URL (we use direct SQL to
                bypass RLS for the rollback transaction). Set it on the
                connection settings page.
              </span>
            </p>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-md border hairline bg-bg-raised px-4 py-6 text-sm text-fg-muted">
          Loading sessions…
        </div>
      ) : (data?.sessions ?? []).length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ kind, sessions }) => (
            <section key={kind} className="space-y-2">
              <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                <AgentIcon kind={kind} />
                {kind.replace(/_/g, " ")} · {sessions.length}
              </h3>
              <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onOpen={() => setOpenId(s.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {openId && (
        <SessionDrawer
          connectionId={connectionId}
          sessionId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function groupByAgent(sessions: SessionSummary[]): Array<{ kind: AgentKind; sessions: SessionSummary[] }> {
  const buckets = new Map<AgentKind, SessionSummary[]>();
  for (const s of sessions) {
    if (!buckets.has(s.kind)) buckets.set(s.kind, []);
    buckets.get(s.kind)!.push(s);
  }
  // AI agents first, then humans / unknowns.
  const order: AgentKind[] = [
    "cursor",
    "claude_code",
    "replit_agent",
    "lovable",
    "v0",
    "vercel_ai_sdk",
    "openrouter",
    "ai_unknown",
    "browser",
    "cli",
    "unknown",
  ];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      kind: k,
      sessions: buckets.get(k) ?? [],
    }));
}

function AgentIcon({ kind }: { kind: AgentKind }) {
  if (kind === "browser" || kind === "cli")
    return <Code2 className="h-3 w-3 text-fg-faint" aria-hidden />;
  if (kind === "unknown")
    return <DatabaseIcon className="h-3 w-3 text-fg-faint" aria-hidden />;
  return <Bot className="h-3 w-3 text-accent" aria-hidden />;
}

function SessionRow({ session, onOpen }: { session: SessionSummary; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-sunken/60"
      >
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-sunken">
          <AgentIcon kind={session.kind} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-display text-sm text-fg">{session.label}</span>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-faint">
            <span>{session.mutationCount} mutation{session.mutationCount === 1 ? "" : "s"}</span>
            {session.tablesTouched.length > 0 && (
              <span className="font-mono truncate" title={session.tablesTouched.join(", ")}>
                {session.tablesTouched.slice(0, 3).join(", ")}
                {session.tablesTouched.length > 3 && ` +${session.tablesTouched.length - 3}`}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {relativeFromNow(session.lastSeenAt)}
            </span>
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "undone") return <Badge tone="accent">undone</Badge>;
  if (status === "undo_partial") return <Badge tone="warn">undo partial</Badge>;
  if (status === "undo_failed") return <Badge tone="danger">undo failed</Badge>;
  if (status === "closed") return <Badge>closed</Badge>;
  return <Badge tone="accent">active</Badge>;
}

// ---------------------------------------------------------------------------
// Detail drawer with mutation list + undo
// ---------------------------------------------------------------------------

function SessionDrawer({
  connectionId,
  sessionId,
  onClose,
}: {
  connectionId: string;
  sessionId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-session", connectionId, sessionId],
    queryFn: () => fetchDetail(connectionId, sessionId),
  });
  const [undoing, setUndoing] = useState(false);
  const confirmUndo = useConfirm();

  const undo = useCallback(async () => {
    if (!data) return;
    confirmUndo.ask(async () => {
      setUndoing(true);
      try {
        const res = await fetch(
          `/api/connections/${encodeURIComponent(connectionId)}/sessions/${encodeURIComponent(sessionId)}/undo`,
          { method: "POST" },
        );
        const j = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          toast.error((j.message as string) ?? `HTTP ${res.status}`);
          return;
        }
        const result = j as unknown as UndoResult;
        if (result.error) {
          toast.error(`Undo failed: ${result.error}`);
        } else {
          toast.success(
            `Reversed ${result.reverted} of ${result.attempted} mutation${result.attempted === 1 ? "" : "s"}${result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}.`,
          );
        }
        qc.invalidateQueries({ queryKey: ["agent-sessions", connectionId] });
        qc.invalidateQueries({ queryKey: ["agent-session", connectionId, sessionId] });
      } finally {
        setUndoing(false);
      }
    });
  }, [connectionId, data, qc, sessionId, confirmUndo]);

  return (
    <>
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" className="!max-w-2xl">
        <DialogTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" aria-hidden />
          {data?.session.label ?? "Session"}
        </DialogTitle>
        <DialogDescription>
          {data ? (
            <>
              {data.session.mutationCount} mutation
              {data.session.mutationCount === 1 ? "" : "s"} ·{" "}
              {data.session.tablesTouched.length} table
              {data.session.tablesTouched.length === 1 ? "" : "s"} touched ·
              first seen {relativeFromNow(data.session.startedAt)}
            </>
          ) : (
            "Loading…"
          )}
        </DialogDescription>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
            Loading mutations…
          </div>
        ) : (
          <>
            {data.session.status === "undone" && (
              <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
                <p className="font-medium text-accent">Already undone</p>
                <p className="text-fg-muted">
                  Reversed {data.session.undoRevertedCount} of{" "}
                  {data.session.undoAttemptedCount} mutations on{" "}
                  {new Date(data.session.closedAt ?? data.session.lastSeenAt).toLocaleString()}.
                </p>
              </div>
            )}
            {data.session.undoError && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
                <p className="font-medium text-danger">Undo failed</p>
                <p className="text-fg-muted">{data.session.undoError}</p>
              </div>
            )}

            <section className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                Mutations · {data.writes.length}
              </h3>
              {data.writes.length === 0 ? (
                <p className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-faint">
                  No mutations recorded for this session.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.writes.map((w) => (
                    <WriteRow key={w.id} write={w} />
                  ))}
                </ul>
              )}
            </section>

            {data.session.userAgentRaw && (
              <details className="text-[11px] text-fg-faint">
                <summary className="cursor-pointer">User-Agent</summary>
                <code className="mt-1 block break-all rounded bg-bg-sunken px-2 py-1 font-mono">
                  {data.session.userAgentRaw}
                </code>
              </details>
            )}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t hairline pt-3">
              <p className="text-[11px] text-fg-faint">
                Undo bypasses RLS via the Direct Postgres URL and runs every
                reversal in one transaction.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                {canMutate(data.myRole) ? (
                  <Button
                    variant="danger"
                    disabled={
                      !data.canUndo ||
                      undoing ||
                      data.session.status === "undone" ||
                      data.writes.length === 0
                    }
                    onClick={undo}
                    title={!data.canUndo ? "Set the Direct Postgres URL on connection settings." : undefined}
                  >
                    {undoing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Undo session
                  </Button>
                ) : (
                  <span className="rounded-full border hairline bg-bg-sunken/40 px-2.5 py-1 text-[11px] text-fg-faint">
                    viewer · read only
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      {...confirmUndo.dialogProps}
      title="Undo this session?"
      description={
        <>
          Reverses{" "}
          <strong>
            {data?.writes.length ?? 0} mutation{(data?.writes.length ?? 0) === 1 ? "" : "s"}
          </strong>{" "}
          atomically: deletes inserts, restores deletes, reverts updates to
          their before-row state. Runs inside a single transaction - either
          all reverts apply or none do.
        </>
      }
      confirmLabel="Undo session"
      tone="danger"
    />
    </>
  );
}

function verbIcon(verb: "insert" | "update" | "delete") {
  if (verb === "insert") return <Plus className="h-3 w-3 text-accent" aria-hidden />;
  if (verb === "update") return <Pencil className="h-3 w-3 text-warn" aria-hidden />;
  return <Trash2 className="h-3 w-3 text-danger" aria-hidden />;
}

function WriteRow({ write }: { write: SessionWrite }) {
  const pk = Object.entries(write.primaryKey)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
  return (
    <li className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        {verbIcon(write.verb)}
        <span className="font-mono uppercase text-[10px] tracking-[0.12em] text-fg-faint">
          {write.verb}
        </span>
        <span className="truncate font-mono text-fg">
          {write.schemaName}.{write.tableName}
        </span>
        {pk && (
          <code className="truncate rounded surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
            {pk}
          </code>
        )}
        <span className="ml-auto font-mono text-[10px] text-fg-faint">
          {relativeFromNow(write.createdAt)}
        </span>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border hairline bg-bg-raised px-6 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-base">No sessions yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
        Once an AI tool (Cursor, Claude Code, Replit Agent, Lovable, v0)
        writes to your database through Suparbase, it&apos;ll appear here as
        a session you can review and undo.
      </p>
    </div>
  );
}
