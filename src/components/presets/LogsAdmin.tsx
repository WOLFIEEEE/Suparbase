"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronDown, ChevronRight, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useRows, useRowCount } from "@/lib/api/hooks";
import { SelectionProvider, useSelection } from "@/components/data/SelectionContext";
import { BulkBar } from "@/components/data/BulkBar";
import { ExportMenu } from "@/components/data/ExportMenu";
import { FilterBar } from "@/components/data/FilterBar";
import { ViewTabs } from "@/components/data/ViewTabs";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import type { PresetProps } from "./types";

const TIMESTAMP_PATTERNS = ["created_at", "inserted_at", "occurred_at", "happened_at", "ts", "logged_at"];
const EVENT_PATTERNS = ["event", "event_type", "action", "verb", "operation", "kind", "type"];
const PAYLOAD_PATTERNS = ["payload", "data", "metadata", "details", "body"];
const ACTOR_PATTERNS = ["user_id", "actor_id", "owner_id", "principal_id", "by_user_id"];

function find(table: PresetProps["table"], names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function pkFor(row: Row, primaryKey: string[]): string | null {
  if (primaryKey.length === 0) return null;
  const pk: Record<string, unknown> = {};
  for (const col of primaryKey) {
    if (row[col] == null) return null;
    pk[col] = row[col];
  }
  return encodePkSegment(pk);
}

type Bucket = "today" | "yesterday" | "thisWeek" | "earlier";

function bucketOf(d: Date, now: Date): Bucket {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "yesterday";
  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(now.getDate() - 6);
  if (d >= sixDaysAgo) return "thisWeek";
  return "earlier";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  earlier: "Earlier",
};

function previewJson(value: unknown, max = 80): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(value);
  }
}

function prettyJson(value: unknown): string {
  if (value == null) return ":";
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

export default function LogsAdmin(props: PresetProps) {
  return (
    <SelectionProvider>
      <LogsAdminBody {...props} />
    </SelectionProvider>
  );
}

function LogsAdminBody({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const tsCol = find(table, TIMESTAMP_PATTERNS);
  const eventCol = primary?.titleColumn ?? primary?.badgeColumn ?? analysis?.statusColumn ?? find(table, EVENT_PATTERNS);
  const payloadCol = find(table, PAYLOAD_PATTERNS);
  const actorCol = find(table, ACTOR_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 50 as const;
  const filters = useMemo(() => parseFilterParams(sp), [sp]);

  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: tsCol ? { column: tsCol, direction: "desc" } : undefined,
      search: debouncedSearch || undefined,
      filters,
    }),
    [page, debouncedSearch, tsCol, filters],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

  const displayName = analysis?.displayName ?? "Activity";
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  // Group rows by day bucket (only if we have a timestamp column).
  const bucketed = useMemo(() => {
    if (!tsCol) return null;
    const now = new Date();
    const out: Record<Bucket, Row[]> = { today: [], yesterday: [], thisWeek: [], earlier: [] };
    let last24 = 0;
    let last7d = 0;
    const distinctEvents = new Set<string>();
    for (const r of rows) {
      const raw = r[tsCol];
      const d = raw ? new Date(String(raw)) : null;
      if (!d || Number.isNaN(d.getTime())) {
        out.earlier.push(r);
        continue;
      }
      out[bucketOf(d, now)].push(r);
      const diff = now.getTime() - d.getTime();
      if (diff < 24 * 60 * 60 * 1000) last24 += 1;
      if (diff < 7 * 24 * 60 * 60 * 1000) last7d += 1;
      if (eventCol && r[eventCol] != null) distinctEvents.add(String(r[eventCol]));
    }
    return { groups: out, last24, last7d, distinct: distinctEvents.size };
  }, [rows, tsCol, eventCol]);

  const selection = useSelection();
  const pageKeys: string[] = [];
  for (const r of rows) {
    const seg = pkFor(r, table.primaryKey);
    if (seg) pageKeys.push(seg);
  }
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((k) => selection.isSelected(k));

  const eventSelectionProps = (r: Row) => {
    const seg = pkFor(r, table.primaryKey);
    return {
      selectionKey: seg,
      isSelected: seg ? selection.isSelected(seg) : false,
      onSelectionToggle: seg ? () => selection.toggle(seg) : undefined,
    };
  };

  const visibleCols = (analysis?.listColumns?.length ? analysis.listColumns : table.columns.map((c) => c.name)).filter(
    (c) => !(analysis?.hiddenColumns ?? []).includes(c),
  );

  const headerActions = (
    <>
      <PresetSwitcher active="logs" />
      <ExportMenu
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />
      <Button
        variant="secondary"
        size="md"
        onClick={() =>
          qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] })
        }
        disabled={isFetching}
        aria-label="Refresh"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden />
        <span className="hidden sm:inline">Refresh</span>
      </Button>
    </>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={displayName}
          subtitle={<span className="font-mono">{table.schema}.{table.name}</span>}
          eyebrow={analysis && <><Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}</>}
          actions={headerActions}
        />
        <ErrorBanner
          error={
            error instanceof AppError
              ? error
              : new AppError("client_bug", String((error as Error).message ?? error))
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={displayName}
        subtitle={
          <span className="inline-flex items-center gap-2 font-mono text-xs">
            {table.schema}.{table.name}
            {table.kind === "view" && (
              <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warn">
                view
              </span>
            )}
          </span>
        }
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : null
        }
        actions={headerActions}
        tabs={
          <ViewTabs
            connectionId={connectionId}
            tableSchema={table.schema}
            tableName={table.name}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Total events"
          value={totalCount != null ? totalCount.toLocaleString() : ":"}
          hint={tsCol ? "newest first" : "no timestamp"}
        />
        <StatTile
          label="Last 24h"
          value={bucketed ? bucketed.last24 : ":"}
          hint="on this page"
        />
        <StatTile
          label="Last 7 days"
          value={bucketed ? bucketed.last7d : ":"}
          hint="on this page"
        />
        <StatTile
          label="Event types"
          value={bucketed ? bucketed.distinct : ":"}
          hint={eventCol ? `column: ${eventCol}` : "no event column"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded border hairline bg-bg-raised px-3 py-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
            checked={allPageSelected}
            onChange={() => selection.toggleMany(pageKeys, allPageSelected)}
            aria-label="Select all on this page"
          />
          <span className="hidden sm:inline">page</span>
        </label>
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            placeholder="Search events…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search activity in ${table.name}`}
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
      </div>

      <FilterBar table={table} />

      {!tsCol && (
        <div className="flex items-start gap-3 rounded-md border hairline bg-warn/5 p-4 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p className="text-fg-muted">
            No timestamp column found on this table: events are shown in primary-key order, not
            time-ordered.
          </p>
        </div>
      )}

      {isLoading && rows.length === 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full rounded-md" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
          {debouncedSearch ? <>Nothing matches.</> : <>No events yet.</>}
        </div>
      ) : !tsCol || !bucketed ? (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <EventRow
              key={`e-${i}`}
              row={r}
              connectionId={connectionId}
              tableName={table.name}
              primaryKey={table.primaryKey}
              tsCol={tsCol}
              eventCol={eventCol}
              payloadCol={payloadCol}
              actorCol={actorCol}
              {...eventSelectionProps(r)}
            />
          ))}
        </ul>
      ) : (
        <div className="space-y-6">
          {(["today", "yesterday", "thisWeek", "earlier"] as const).map((bucket) => {
            const groupRows = bucketed.groups[bucket];
            if (groupRows.length === 0) return null;
            return (
              <section key={bucket}>
                <h2 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  {BUCKET_LABEL[bucket]}{" "}
                  <span className="text-fg-faint">· {groupRows.length}</span>
                </h2>
                <ul className="space-y-1.5">
                  {groupRows.map((r, i) => (
                    <EventRow
                      key={`${bucket}-${i}`}
                      row={r}
                      connectionId={connectionId}
                      tableName={table.name}
                      primaryKey={table.primaryKey}
                      tsCol={tsCol}
                      eventCol={eventCol}
                      payloadCol={payloadCol}
                      actorCol={actorCol}
                      {...eventSelectionProps(r)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? totalCount ?? null}
        onPageChange={(p) => {
          const url = new URLSearchParams(sp.toString());
          url.set("page", String(Math.max(1, p)));
          router.push(`?${url.toString()}`);
        }}
      />

      <p className="text-[11px] text-fg-faint">
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: activity stream"}
      </p>

      <BulkBar
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />
    </div>
  );
}

interface EventRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  tsCol: string | null;
  eventCol: string | null;
  payloadCol: string | null;
  actorCol: string | null;
  selectionKey: string | null;
  isSelected: boolean;
  onSelectionToggle?: () => void;
}

function EventRow({ row, connectionId, tableName, primaryKey, tsCol, eventCol, payloadCol, actorCol, isSelected, onSelectionToggle }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const event = eventCol ? row[eventCol] : null;
  const actor = actorCol ? row[actorCol] : null;
  const ts = tsCol ? row[tsCol] : null;
  const payload = payloadCol ? row[payloadCol] : null;
  const rel = ts ? relativeFromNow(ts as string) : null;
  const abs = ts ? new Date(String(ts)).toLocaleString() : null;
  const pkSegment = pkFor(row, primaryKey);
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(tableName)}/${pkSegment}`
    : null;

  return (
    <li>
      <div className={cn(
        "surface rounded-md p-3 transition-colors hover:border-line-strong",
        isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}>
        <div className="flex items-start gap-3">
          {onSelectionToggle && (
            <label
              className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
                checked={isSelected}
                onChange={onSelectionToggle}
                aria-label="Select event"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-fg-faint hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={expanded ? "Collapse payload" : "Expand payload"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              {event != null && (
                <StatusPill value={String(event)} />
              )}
              {actor != null && (
                <span className="truncate text-xs text-fg-muted">
                  by {String(actor).slice(0, 24)}
                </span>
              )}
              {payload != null && !expanded && (
                <span className="min-w-0 truncate font-mono text-[11px] text-fg-faint">
                  {previewJson(payload)}
                </span>
              )}
            </div>
            {expanded && payload != null && (
              <pre className="mt-2 max-h-96 overflow-auto rounded surface-sunken p-2 text-[11px] leading-relaxed">
                {prettyJson(payload)}
              </pre>
            )}
          </div>
          <div className="shrink-0 text-right text-[11px] text-fg-faint" title={abs ?? undefined}>
            {rel ?? (ts ? String(ts) : "")}
          </div>
          {detailHref && (
            <Link
              href={detailHref}
              className="shrink-0 rounded p-1 text-fg-faint hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Open event"
            >
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
