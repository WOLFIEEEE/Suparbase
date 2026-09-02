"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Gauge, RefreshCw } from "lucide-react";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { formatBytes } from "@/lib/performance/advisor";
import type { PerformanceReport, Suggestion, TableStat } from "@/lib/performance/types";
import { AppError } from "@/lib/errors";
import { relativeFromNow } from "@/lib/ui/time";
import { cn } from "@/lib/ui/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { EmptyState } from "@/components/workspace/EmptyState";
import { ErrorBanner } from "@/components/connections/ErrorBanner";

async function fetchReport(connectionId: string): Promise<PerformanceReport> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/performance`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new AppError(
      ((json?.category as AppError["category"]) ?? "server"),
      (json?.message as string | undefined) ?? "Could not load performance statistics.",
    );
  }
  return json as unknown as PerformanceReport;
}

const SEVERITY_TONE: Record<Suggestion["severity"], "danger" | "warn" | "neutral"> = {
  critical: "danger",
  warn: "warn",
  info: "neutral",
};

type SortKey = "size" | "rows" | "seq" | "dead";

export function PerformanceView() {
  const connection = useCurrentConnection();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["performance", connection.id],
    queryFn: () => fetchReport(connection.id),
    enabled: connection.hasPostgresUrl,
    staleTime: 60_000,
  });
  const [sort, setSort] = useState<SortKey>("size");
  const [showAllTables, setShowAllTables] = useState(false);

  const tables = useMemo(() => {
    const list = [...(data?.tables ?? [])];
    const by: Record<SortKey, (t: TableStat) => number> = {
      size: (t) => t.totalBytes,
      rows: (t) => t.estimatedRows,
      seq: (t) => t.seqScan,
      dead: (t) => (t.liveTuples + t.deadTuples > 0 ? t.deadTuples / (t.liveTuples + t.deadTuples) : 0),
    };
    list.sort((a, b) => by[sort](b) - by[sort](a));
    return showAllTables ? list : list.slice(0, 25);
  }, [data, sort, showAllTables]);

  const header = (
    <PageHeader
      breadcrumbs={[{ label: connection.name, href: `/c/${connection.id}` }, { label: "Performance" }]}
      eyebrow={
        <>
          <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden /> pg_stat
        </>
      }
      title="Performance"
      subtitle={
        <span className="text-xs text-fg-muted">
          Table sizes, scan patterns, bloat, unused indexes, and slow statements, read from Postgres statistics views. No row data is read.
          {data && ` Collected ${relativeFromNow(data.collectedAt) ?? "just now"}.`}
        </span>
      }
      actions={
        connection.hasPostgresUrl ? (
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden /> Refresh
          </Button>
        ) : null
      }
    />
  );

  if (!connection.hasPostgresUrl) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="Needs the Direct Postgres URL"
          description="Statistics come from pg_stat_* views, which PostgREST does not expose. Add the URL on connection settings to unlock this page."
          action={
            connection.myRole === "owner" ? (
              <Button asChild>
                <Link href={`/c/${connection.id}/settings`}>Open settings</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorBanner error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const unusedIndexes = data.indexes.filter((i) => i.scans === 0 && !i.isPrimary && !i.isUnique);
  const connUsed = data.connections.active + data.connections.idle;

  return (
    <div className="space-y-8">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Database size" value={formatBytes(data.databaseBytes)} hint={`${data.tables.length} tables`} />
        <StatTile
          label="Cache hit ratio"
          value={data.cacheHitRatio === null ? "n/a" : `${(data.cacheHitRatio * 100).toFixed(1)}%`}
          hint={data.indexHitRatio === null ? "no index reads yet" : `index ${(data.indexHitRatio * 100).toFixed(1)}%`}
        />
        <StatTile
          label="Connections"
          value={`${connUsed} / ${data.connections.max || "?"}`}
          hint={`${data.connections.active} active · ${data.connections.idle} idle`}
        />
        <StatTile
          label="Suggestions"
          value={data.suggestions.length}
          hint={
            data.suggestions.length === 0
              ? "nothing to flag"
              : `${data.suggestions.filter((s) => s.severity === "critical").length} critical`
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Advisor</h2>
        {data.suggestions.length === 0 ? (
          <p className="surface rounded-md p-5 text-sm text-fg-muted">
            No advice right now. The heuristics need real volume before they speak up, so a quiet project is a good sign, not a missing feature.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Tables</h2>
          <div className="inline-flex items-center rounded border hairline text-[11px]">
            {(
              [
                ["size", "Size"],
                ["rows", "Rows"],
                ["seq", "Seq scans"],
                ["dead", "Dead %"],
              ] as Array<[SortKey, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn("px-2.5 py-1", sort === k ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="surface overflow-x-auto rounded-md">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-fg-faint">
              <tr className="border-b hairline">
                <th className="px-3 py-2 font-medium">Table</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Indexes</th>
                <th className="px-3 py-2 text-right font-medium">~Rows</th>
                <th className="px-3 py-2 text-right font-medium">Seq / idx scans</th>
                <th className="px-3 py-2 text-right font-medium">Dead</th>
                <th className="px-3 py-2 text-right font-medium">Analyzed</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => {
                const deadRatio = t.liveTuples + t.deadTuples > 0 ? t.deadTuples / (t.liveTuples + t.deadTuples) : 0;
                const analyzed = [t.lastAnalyze, t.lastAutoanalyze].filter(Boolean).sort().at(-1) ?? null;
                return (
                  <tr key={`${t.schema}.${t.name}`} className="border-b hairline last:border-b-0">
                    <td className="px-3 py-1.5 font-mono">
                      {t.schema !== "public" && <span className="text-fg-faint">{t.schema}.</span>}
                      {t.schema === "public" ? (
                        <Link href={`/c/${connection.id}/tables/${encodeURIComponent(t.name)}`} className="hover:text-accent">
                          {t.name}
                        </Link>
                      ) : (
                        t.name
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatBytes(t.totalBytes)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-fg-muted">{formatBytes(t.indexBytes)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.estimatedRows.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-fg-muted">
                      {t.seqScan.toLocaleString()} / {t.idxScan.toLocaleString()}
                    </td>
                    <td className={cn("px-3 py-1.5 text-right tabular-nums", deadRatio >= 0.2 ? "text-warn" : "text-fg-muted")}>
                      {(deadRatio * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-1.5 text-right text-fg-faint">{analyzed ? relativeFromNow(analyzed) : "never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.tables.length > 25 && (
          <button type="button" onClick={() => setShowAllTables((v) => !v)} className="text-xs text-fg-muted hover:text-fg">
            {showAllTables ? "Show top 25" : `Show all ${data.tables.length} tables`}
          </button>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Unused indexes</h2>
          {unusedIndexes.length === 0 ? (
            <p className="surface rounded-md p-4 text-xs text-fg-muted">Every non-constraint index has been used at least once.</p>
          ) : (
            <ul className="surface divide-y divide-[rgb(var(--line))] rounded-md">
              {unusedIndexes.slice(0, 20).map((ix) => (
                <li key={`${ix.schema}.${ix.name}`} className="px-4 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono">{ix.name}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{formatBytes(ix.bytes)}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-fg-faint" title={ix.definition}>
                    on {ix.table}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Slowest statements</h2>
          {!data.hasStatStatements ? (
            <p className="surface rounded-md p-4 text-xs text-fg-muted">
              <code className="font-mono">pg_stat_statements</code> is not readable on this connection. Enable the extension in the Supabase dashboard (Database → Extensions) to see per-query timings here.
            </p>
          ) : data.statements.length === 0 ? (
            <p className="surface rounded-md p-4 text-xs text-fg-muted">No statements recorded yet.</p>
          ) : (
            <ul className="surface divide-y divide-[rgb(var(--line))] rounded-md">
              {data.statements.map((s, i) => (
                <li key={i} className="px-4 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-fg-faint">
                    <span>
                      {s.calls.toLocaleString()} calls · mean {s.meanMs.toFixed(1)} ms
                    </span>
                    <span className="tabular-nums">{(s.totalMs / 1000).toFixed(1)} s total</span>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-fg-muted">{s.query}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Extensions</h2>
        <div className="flex flex-wrap gap-1.5">
          {data.extensions.map((e) => (
            <Badge key={e.name} tone="outline" className="normal-case tracking-normal">
              {e.name} <span className="text-fg-faint">{e.version}</span>
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <li className="surface rounded-md p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[suggestion.severity]}>{suggestion.severity}</Badge>
        <span className="text-sm font-medium">{suggestion.title}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{suggestion.detail}</p>
      {suggestion.sql && (
        <div className="mt-2 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-[11px] leading-snug">{suggestion.sql}</pre>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard
                .writeText(suggestion.sql ?? "")
                .then(() => toast.success("Copied SQL"))
                .catch(() => toast.error("Clipboard is not available."))
            }
            className="shrink-0 rounded border hairline p-1.5 text-fg-faint hover:text-fg"
            aria-label="Copy SQL"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
