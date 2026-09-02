"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, GitCompareArrows, Loader2 } from "lucide-react";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SchemaTabs } from "@/components/workspace/SchemaTabs";
import { relativeFromNow } from "@/lib/ui/time";
import { summarizeDiff, type SnapshotDiff } from "@/lib/schema-snapshot";
import { cn } from "@/lib/ui/cn";

interface SnapshotSummary {
  id: string;
  fingerprint: string;
  source: "auto" | "manual";
  label: string | null;
  tableCount: number;
  columnCount: number;
  createdAt: string;
}

interface DiffResponse {
  from: { id: string; createdAt: string | null };
  to: { id: string; createdAt: string | null };
  diff: SnapshotDiff;
}

async function fetchSnapshots(connectionId: string): Promise<SnapshotSummary[]> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/schema-snapshots`);
  if (!res.ok) throw new Error("Could not load snapshots.");
  return ((await res.json()) as { snapshots: SnapshotSummary[] }).snapshots;
}

async function fetchDiff(connectionId: string, from: string, to: string): Promise<DiffResponse> {
  const res = await fetch(
    `/api/connections/${encodeURIComponent(connectionId)}/schema-snapshots/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(e?.message ?? "Could not compute the diff.");
  }
  return (await res.json()) as DiffResponse;
}

/**
 * Schema drift timeline: every automatically captured or manual snapshot,
 * and a diff view between any two (or a snapshot and the live schema).
 */
export function SchemaHistoryView() {
  const connection = useCurrentConnection();
  const qc = useQueryClient();
  const canSnapshot = connection.myRole !== "viewer";
  const key = ["schema-snapshots", connection.id];
  const { data: snapshots, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchSnapshots(connection.id) });

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string>("live");

  // Default comparison: previous snapshot → latest snapshot, or latest → live.
  useEffect(() => {
    if (!snapshots || snapshots.length === 0 || from) return;
    if (snapshots.length >= 2) {
      setFrom(snapshots[1]!.id);
      setTo(snapshots[0]!.id);
    } else {
      setFrom(snapshots[0]!.id);
      setTo("live");
    }
  }, [snapshots, from]);

  const diffQuery = useQuery({
    queryKey: ["schema-snapshot-diff", connection.id, from, to],
    queryFn: () => fetchDiff(connection.id, from!, to),
    enabled: !!from && from !== to,
  });

  const snapshotNow = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/connections/${encodeURIComponent(connection.id)}/schema-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Snapshot failed.");
      }
    },
    onSuccess: () => {
      toast.success("Snapshot saved");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = useMemo(() => snapshots ?? [], [snapshots]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Schema", href: `/c/${connection.id}/schema` },
          { label: "History" },
        ]}
        title="Schema history"
        subtitle={
          <span className="text-xs text-fg-muted">
            A snapshot is stored automatically whenever the schema changes between visits. Compare any two, or a snapshot against the live database.
          </span>
        }
        actions={
          canSnapshot ? (
            <Button size="sm" onClick={() => snapshotNow.mutate()} disabled={snapshotNow.isPending}>
              {snapshotNow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Camera className="h-3.5 w-3.5" aria-hidden />}
              Snapshot now
            </Button>
          ) : null
        }
        tabs={<SchemaTabs connectionId={connection.id} active="history" />}
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-md" />
      ) : options.length === 0 ? (
        <EmptyState
          title="No snapshots yet"
          description="Open the Schema tab once (or press Snapshot now) and the first capture will appear here. Later changes are recorded automatically."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
          <section className="surface rounded-md p-4">
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">Snapshots</h2>
            <ol className="space-y-1.5">
              {options.map((s, i) => (
                <li key={s.id} className="rounded border hairline px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{s.label ?? (i === 0 ? "Latest" : relativeFromNow(s.createdAt))}</span>
                    <Badge tone={s.source === "manual" ? "accent" : "neutral"}>{s.source}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-faint">
                    {new Date(s.createdAt).toLocaleString()} · {s.tableCount} tables · {s.columnCount} columns
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setFrom(s.id)}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        from === s.id ? "border-accent bg-accent/10 text-accent" : "hairline text-fg-muted hover:text-fg",
                      )}
                    >
                      from
                    </button>
                    <button
                      type="button"
                      onClick={() => setTo(s.id)}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        to === s.id ? "border-accent bg-accent/10 text-accent" : "hairline text-fg-muted hover:text-fg",
                      )}
                    >
                      to
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setTo("live")}
              className={cn(
                "mt-3 w-full rounded border px-3 py-2 text-left text-xs",
                to === "live" ? "border-accent bg-accent/10 text-accent" : "hairline text-fg-muted hover:text-fg",
              )}
            >
              Compare against the live database
            </button>
          </section>

          <section className="surface rounded-md p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              <GitCompareArrows className="h-3 w-3" aria-hidden /> Changes
            </h2>
            {!from || from === to ? (
              <p className="text-xs text-fg-muted">Pick two different points to compare.</p>
            ) : diffQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : diffQuery.error ? (
              <p className="text-xs text-danger">{(diffQuery.error as Error).message}</p>
            ) : diffQuery.data ? (
              <DiffView data={diffQuery.data} />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

function DiffView({ data }: { data: DiffResponse }) {
  const { diff } = data;
  const fromLabel = data.from.createdAt ? new Date(data.from.createdAt).toLocaleString() : data.from.id;
  const toLabel = data.to.id === "live" ? "live database" : data.to.createdAt ? new Date(data.to.createdAt).toLocaleString() : data.to.id;
  return (
    <div className="space-y-4 text-xs">
      <p className="text-fg-muted">
        <span className="font-mono">{fromLabel}</span> → <span className="font-mono">{toLabel}</span>:{" "}
        <strong className="text-fg">{summarizeDiff(diff)}</strong>
      </p>
      {diff.identical ? (
        <p className="rounded border border-accent/40 bg-accent/5 px-3 py-2 text-fg-muted">The two schemas are identical.</p>
      ) : (
        <>
          {diff.addedTables.map((t) => (
            <div key={`+${t.schema}.${t.name}`} className="rounded border border-accent/40 bg-accent/5 px-3 py-2">
              <div className="font-mono text-accent">+ {t.schema}.{t.name}</div>
              <div className="mt-0.5 text-[11px] text-fg-faint">{t.columns.length} columns</div>
            </div>
          ))}
          {diff.removedTables.map((t) => (
            <div key={`-${t.schema}.${t.name}`} className="rounded border border-danger/40 bg-danger/5 px-3 py-2">
              <div className="font-mono text-danger">− {t.schema}.{t.name}</div>
              <div className="mt-0.5 text-[11px] text-fg-faint">{t.columns.length} columns</div>
            </div>
          ))}
          {diff.changedTables.map((t) => (
            <div key={t.table} className="rounded border hairline px-3 py-2">
              <div className="font-mono text-fg">~ {t.table}</div>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px]">
                {t.addedColumns.map((c) => (
                  <li key={`+${c.name}`} className="text-accent">+ {c.name} <span className="text-fg-faint">{c.pgType}{c.nullable ? "" : " not null"}</span></li>
                ))}
                {t.removedColumns.map((c) => (
                  <li key={`-${c.name}`} className="text-danger">− {c.name} <span className="text-fg-faint">{c.pgType}</span></li>
                ))}
                {t.changedColumns.map((c, i) => (
                  <li key={`${c.column}-${c.kind}-${i}`} className="text-warn">
                    ~ {c.column} <span className="text-fg-faint">{c.kind}:</span> {c.from} <span className="text-fg-faint">→</span> {c.to}
                  </li>
                ))}
                {t.primaryKeyChanged && (
                  <li className="text-warn">
                    ~ primary key: {t.primaryKeyChanged.from.join(", ") || "(none)"} <span className="text-fg-faint">→</span> {t.primaryKeyChanged.to.join(", ") || "(none)"}
                  </li>
                )}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
