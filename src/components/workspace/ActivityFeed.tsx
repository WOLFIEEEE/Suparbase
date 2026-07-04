"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Filter, Plus, Pencil, Trash2 } from "lucide-react";
import { encodePkSegment } from "@/lib/table/pk";
import type { PrimaryKeyValue } from "@/lib/types/schema";
import { cn } from "@/lib/ui/cn";

interface Entry {
  id: string;
  verb: "insert" | "update" | "delete";
  schemaName: string | null;
  tableName: string | null;
  primaryKey: Record<string, unknown>;
  httpStatus: number | null;
  createdAt: string;
  sessionId: string | null;
  sessionLabel: string | null;
  sessionKind: string | null;
}

const VERB_META: Record<Entry["verb"], { icon: typeof Plus; tone: string; label: string }> = {
  insert: { icon: Plus, tone: "text-accent", label: "insert" },
  update: { icon: Pencil, tone: "text-warn", label: "update" },
  delete: { icon: Trash2, tone: "text-danger", label: "delete" },
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ActivityFeed({ connectionId }: { connectionId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [verb, setVerb] = useState<"" | Entry["verb"]>("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "50" });
      if (verb) params.set("verb", verb);
      if (before) params.set("before", before);
      const res = await fetch(`/api/connections/${connectionId}/activity?${params}`);
      const data = (await res.json().catch(() => ({ entries: [] }))) as { entries: Entry[] };
      const next = data.entries ?? [];
      setEntries((prev) => (before ? [...prev, ...next] : next));
      setDone(next.length < 50);
      setLoading(false);
    },
    [connectionId, verb],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
        <div className="inline-flex rounded border hairline text-[11px]">
          {(["", "insert", "update", "delete"] as const).map((v) => (
            <button
              key={v || "all"}
              type="button"
              onClick={() => setVerb(v)}
              className={cn(
                "px-2.5 py-1 capitalize",
                verb === v ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
              )}
            >
              {v || "all"}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 && !loading ? (
        <p className="surface rounded-md p-6 text-sm text-fg-muted">
          No writes recorded yet. Any INSERT / UPDATE / DELETE proxied through Suparbase shows up here.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e) => {
            const meta = VERB_META[e.verb];
            const table = e.tableName ? `${e.schemaName}.${e.tableName}` : "—";
            const pkHref =
              e.tableName && Object.keys(e.primaryKey).length > 0
                ? `/c/${connectionId}/tables/${encodeURIComponent(e.tableName)}/${encodePkSegment(e.primaryKey as PrimaryKeyValue)}`
                : null;
            const inner = (
              <article className="surface flex items-center gap-3 rounded-md p-3">
                <meta.icon className={cn("h-4 w-4 shrink-0", meta.tone)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn("font-medium uppercase text-[11px] tracking-wide", meta.tone)}>
                      {meta.label}
                    </span>
                    <span className="truncate font-mono text-xs text-fg">{table}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-faint">
                    {e.sessionLabel ? (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="h-3 w-3" aria-hidden />
                        {e.sessionLabel}
                      </span>
                    ) : (
                      <span>manual</span>
                    )}
                    <span>·</span>
                    <span className="truncate font-mono">
                      {Object.entries(e.primaryKey)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join(" ") || "—"}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-fg-faint">{timeAgo(e.createdAt)}</span>
              </article>
            );
            return <li key={e.id}>{pkHref ? <Link href={pkHref}>{inner}</Link> : inner}</li>;
          })}
        </ol>
      )}

      {!done && entries.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => load(entries[entries.length - 1]?.createdAt)}
            className="rounded-md border hairline px-4 py-1.5 text-xs text-fg-muted hover:border-line-strong hover:text-fg disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
