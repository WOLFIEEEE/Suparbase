"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, RefreshCw, Search, X } from "lucide-react";
import { useRows } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { PresetHeader } from "./shared/PresetHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { PresetProps } from "./types";

const TIMESTAMP_PATTERNS = ["created_at", "inserted_at", "occurred_at", "happened_at", "ts"];
const EVENT_PATTERNS = ["event", "event_type", "action", "verb", "operation", "kind", "type"];
const PAYLOAD_PATTERNS = ["payload", "data", "metadata", "details", "body"];
const ACTOR_PATTERNS = ["user_id", "actor_id", "owner_id", "principal_id"];

function find(table: PresetProps["table"], names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function tryPretty(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function LogsAdmin({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const tsCol = find(table, TIMESTAMP_PATTERNS);
  const eventCol = analysis?.statusColumn ?? find(table, EVENT_PATTERNS);
  const payloadCol = find(table, PAYLOAD_PATTERNS);
  const actorCol = find(table, ACTOR_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 50 as const;
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: tsCol ? { column: tsCol, direction: "desc" } : undefined,
      search: debouncedSearch || undefined,
    }),
    [page, debouncedSearch, tsCol],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const rows = data?.rows ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const displayName = analysis?.displayName ?? "Logs";

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PresetHeader
          connectionId={connectionId}
          tableName={table.name}
          displayName={displayName}
          analysis={analysis}
        />
        <ErrorBanner
          error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PresetHeader
        connectionId={connectionId}
        tableName={table.name}
        displayName={displayName}
        analysis={analysis}
        actions={<PresetSwitcher active="logs" />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            placeholder={eventCol ? `Filter by ${eventCol}…` : "Search events…"}
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search events in ${table.name}`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] })}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded border hairline">
        {isLoading && rows.length === 0 ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-fg-muted">
            {debouncedSearch ? "No events match this search." : "No events yet."}
          </div>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((row, idx) => {
              const ts = tsCol ? row[tsCol] : null;
              const event = eventCol ? row[eventCol] : null;
              const payload = payloadCol ? row[payloadCol] : null;
              const actor = actorCol ? row[actorCol] : null;
              const isOpen = expanded.has(idx);
              return (
                <li key={`l-${idx}`} className="bg-bg-sunken/40">
                  <button
                    type="button"
                    onClick={() => toggleExpand(idx)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="font-mono tabular-nums text-fg-faint shrink-0 w-44 truncate">
                      {ts != null ? new Date(String(ts)).toLocaleString() : "—"}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg-raised px-2 py-0.5 font-mono text-[10px] text-fg">
                      <Activity className="h-3 w-3 text-accent" aria-hidden />
                      {event != null ? String(event) : table.name}
                    </span>
                    {actor != null && (
                      <span className="truncate font-mono text-[10px] text-fg-faint">
                        actor: {String(actor).slice(0, 8)}…
                      </span>
                    )}
                    {payload != null && (
                      <span className="ml-auto shrink-0 text-[10px] text-fg-faint">
                        {isOpen ? "hide payload" : "show payload"}
                      </span>
                    )}
                  </button>
                  <div
                    className={cn(
                      "overflow-hidden border-t hairline px-3 transition-all",
                      isOpen ? "max-h-96 py-2" : "max-h-0 py-0",
                    )}
                    aria-hidden={!isOpen}
                  >
                    {payload != null ? (
                      <pre className="max-h-80 overflow-auto rounded surface-sunken p-2 font-mono text-[11px] leading-relaxed">
                        {tryPretty(payload)}
                      </pre>
                    ) : (
                      <div className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
                        {table.columns.map((c) => (
                          <div key={c.name} className="flex gap-2">
                            <span className="font-mono text-fg-muted">{c.name}:</span>
                            <span className="truncate font-mono text-fg-faint">
                              {row[c.name] == null ? "—" : String(row[c.name])}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? null}
        onPageChange={(p) => {
          const url = new URLSearchParams(sp.toString());
          url.set("page", String(Math.max(1, p)));
          router.push(`?${url.toString()}`);
        }}
      />

      <p className="text-[11px] text-fg-faint">
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: append-only log"}
      </p>
    </div>
  );
}
