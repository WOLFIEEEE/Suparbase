"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeFromNow } from "@/lib/ui/time";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import type { PrimaryKeyValue } from "@/lib/types/schema";
import { cn } from "@/lib/ui/cn";

interface Note {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

interface NotesResponse {
  notes: Note[];
  myRole: "owner" | "editor" | "viewer";
  myUserId: string;
}

interface Props {
  connectionId: string;
  tableName: string;
  /** null = notes about the table itself. */
  primaryKey: PrimaryKeyValue | null;
  /** Compact row: collapses to a one-line toggle until opened. */
  collapsible?: boolean;
  className?: string;
}

async function fetchNotes(connectionId: string, tableName: string, pk: PrimaryKeyValue | null): Promise<NotesResponse> {
  const params = new URLSearchParams({ table: tableName, pk: pk ? JSON.stringify(pk) : "" });
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/notes?${params}`);
  if (!res.ok) throw new Error("Could not load notes.");
  return (await res.json()) as NotesResponse;
}

/**
 * Team-visible annotations on a table or a single row. Shown in the right
 * rail of every row detail page and as a collapsible strip on table pages.
 */
export function NotesPanel({ connectionId, tableName, primaryKey, collapsible = false, className }: Props) {
  const connection = useCurrentConnection();
  const qc = useQueryClient();
  const key = ["notes", connectionId, tableName, primaryKey];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchNotes(connectionId, tableName, primaryKey) });
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(!collapsible);
  const canWrite = connection.myRole !== "viewer";

  const add = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: tableName, primaryKey, body }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not add the note.");
      }
    },
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the note.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const notes = data?.notes ?? [];
  const count = notes.length;

  if (collapsible && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded border hairline bg-bg-raised px-3 py-2 text-xs text-fg-muted hover:text-fg",
          className,
        )}
      >
        <StickyNote className="h-3.5 w-3.5" aria-hidden />
        {count === 0 ? "Add a note about this table" : `${count} note${count === 1 ? "" : "s"} on this table`}
      </button>
    );
  }

  return (
    <section className={cn("surface rounded-md p-5", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          <StickyNote className="h-3 w-3" aria-hidden /> Notes
          {count > 0 && <span className="text-fg-faint">· {count}</span>}
        </h3>
        {collapsible && (
          <button type="button" onClick={() => setExpanded(false)} className="text-[11px] text-fg-faint hover:text-fg">
            Hide
          </button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <ul className="space-y-2">
          {notes.length === 0 && (
            <li className="text-xs text-fg-muted">
              {primaryKey ? "No notes on this row yet." : "No notes on this table yet."} Visible to everyone with access to the connection.
            </li>
          )}
          {notes.map((n) => {
            const canDelete = data?.myRole === "owner" || n.authorId === data?.myUserId;
            return (
              <li key={n.id} className="rounded border hairline bg-bg-raised/40 px-3 py-2 text-xs">
                <p className="whitespace-pre-wrap break-words leading-relaxed text-fg">{n.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-fg-faint">
                  <span className="truncate">
                    {n.authorName ?? "someone"} · {relativeFromNow(n.createdAt)}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(n.id)}
                      className="shrink-0 rounded p-0.5 hover:text-danger"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim() || add.isPending) return;
            add.mutate(draft.trim());
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={primaryKey ? "Add context about this row…" : "Add context about this table…"}
            aria-label="New note"
            className="block w-full resize-y rounded border hairline bg-bg-sunken px-3 py-2 text-xs focus:border-line-strong focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) add.mutate(draft.trim());
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-fg-faint">⌘/Ctrl + Enter to post</span>
            <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim() || add.isPending}>
              {add.isPending ? "Posting…" : "Add note"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
