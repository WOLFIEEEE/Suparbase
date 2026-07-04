"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/ui/cn";

interface ColumnStats {
  total: number;
  nonNull: number;
  nullCount: number;
  distinctCount: number;
  min: string | null;
  max: string | null;
  topValues: Array<{ value: string | null; count: number }>;
}

async function fetchStats(
  connectionId: string,
  schema: string,
  table: string,
  column: string,
): Promise<ColumnStats> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/column-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema, table, column }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(e?.message ?? "Could not compute stats.");
  }
  return ((await res.json()) as { stats: ColumnStats }).stats;
}

/**
 * A small "insights" popover for one column: total / null% / distinct /
 * min / max plus a top-values distribution bar. Query runs read-only and
 * only when the popover opens.
 */
export function ColumnInsights({
  connectionId,
  schema,
  table,
  column,
}: {
  connectionId: string;
  schema: string;
  table: string;
  column: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, error } = useQuery({
    queryKey: ["column-stats", connectionId, schema, table, column],
    queryFn: () => fetchStats(connectionId, schema, table, column),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const maxTop = data ? Math.max(1, ...data.topValues.map((t) => t.count)) : 1;
  const nullPct = data && data.total > 0 ? Math.round((data.nullCount / data.total) * 100) : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Insights for ${column}`}
          title="Column insights"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-fg-faint transition-colors hover:bg-bg-sunken hover:text-accent"
        >
          <BarChart3 className="h-3 w-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-fg">{column}</span>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden />}
          </div>

          {error ? (
            <p className="text-xs text-danger">{(error as Error).message}</p>
          ) : !data ? (
            <p className="text-xs text-fg-faint">Computing…</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <Stat label="Rows" value={data.total.toLocaleString()} />
                <Stat label="Distinct" value={data.distinctCount.toLocaleString()} />
                <Stat label="Nulls" value={`${data.nullCount.toLocaleString()} (${nullPct}%)`} />
                <Stat label="Non-null" value={data.nonNull.toLocaleString()} />
                <Stat label="Min" value={data.min ?? "—"} mono />
                <Stat label="Max" value={data.max ?? "—"} mono />
              </dl>

              {data.topValues.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                    Top values
                  </div>
                  <ul className="space-y-1">
                    {data.topValues.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="w-28 shrink-0 truncate font-mono text-fg-muted">
                          {t.value === null ? <span className="italic text-fg-faint">null</span> : t.value || "(empty)"}
                        </span>
                        <span className="relative h-3 flex-1 overflow-hidden rounded-sm bg-bg-sunken">
                          <span
                            className={cn("absolute inset-y-0 left-0 rounded-sm bg-accent/60")}
                            style={{ width: `${Math.max(4, (t.count / maxTop) * 100)}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-fg-faint">
                          {t.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-faint">{label}</dt>
      <dd className={cn("truncate text-fg", mono && "font-mono text-[10px]")}>{value}</dd>
    </div>
  );
}
