"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRows, useRowCount, useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { findAnalysis } from "@/lib/presets/pick";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row, Table } from "@/lib/types/schema";
import { encodePkSegment } from "@/lib/table/pk";
import { formatCellValue } from "@/lib/table/cellFormat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { PaginationBar } from "@/components/data/PaginationBar";
import { SelectionProvider, useSelection } from "@/components/data/SelectionContext";
import { BulkBar } from "@/components/data/BulkBar";
import { ExportMenu } from "@/components/data/ExportMenu";
import { ImportPanel } from "@/components/data/ImportPanel";
import { FilterBar } from "@/components/data/FilterBar";
import { ViewTabs } from "@/components/data/ViewTabs";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { StatusPill } from "@/components/presets/shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

const PAGE_SIZE = 25 as const;

function pkFor(row: Row, primaryKey: string[]): string | null {
  if (primaryKey.length === 0) return null;
  const pk: Record<string, unknown> = {};
  for (const col of primaryKey) {
    if (row[col] == null) return null;
    pk[col] = row[col];
  }
  return encodePkSegment(pk);
}

interface RouterProps {
  tableName: string;
}

/**
 * Generic admin grid — used for any table that doesn't match an opinionated
 * archetype. Rewritten in v1.0 to match the UsersAdmin/ContentAdmin chrome:
 * PageHeader, row cards, BulkBar, ExportMenu, ImportPanel. Click row →
 * detail page (no drawer).
 */
export function TableListView({ tableName }: RouterProps) {
  const connectionId = useCurrentConnectionId();
  const { data: schema, isLoading: schemaLoading } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);

  const table = useMemo(
    () => schema?.tables.find((t) => t.name === tableName),
    [schema, tableName],
  );

  if (schemaLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${tableName}".`}
        action={
          <Button asChild variant="secondary">
            <Link href={`/c/${connectionId}/tables`}>All tables</Link>
          </Button>
        }
      />
    );
  }

  const analysis = findAnalysis(analysisOrNull(cachedAnalysis)?.tables, table);

  return (
    <SelectionProvider>
      <Body connectionId={connectionId} table={table} analysis={analysis} />
    </SelectionProvider>
  );
}

interface BodyProps {
  connectionId: string;
  table: Table;
  analysis: ReturnType<typeof findAnalysis>;
}

function Body({ connectionId, table, analysis }: BodyProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const filters = useMemo(() => parseFilterParams(sp), [sp]);

  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort: undefined,
      search: debouncedSearch || undefined,
      filters,
    }),
    [page, debouncedSearch, filters],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

  const displayName = analysis?.displayName ?? table.name;
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  const visibleCols = useMemo(() => {
    const all = analysis?.listColumns?.length
      ? analysis.listColumns
      : table.columns.map((c) => c.name);
    const hidden = new Set(analysis?.hiddenColumns ?? []);
    return all.filter((c) => !hidden.has(c)).slice(0, 5);
  }, [analysis, table.columns]);

  const selection = useSelection();
  const pageKeys = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const seg = pkFor(r, table.primaryKey);
      if (seg) out.push(seg);
    }
    return out;
  }, [rows, table.primaryKey]);
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((k) => selection.isSelected(k));

  const [openImport, setOpenImport] = useState(false);

  const headerActions = (
    <>
      <PresetSwitcher active="generic" />
      <ExportMenu
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />
      {table.kind === "table" && table.primaryKey.length > 0 && (
        <Button variant="secondary" size="md" onClick={() => setOpenImport(true)}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Import</span>
        </Button>
      )}
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
      {table.kind === "table" && table.primaryKey.length > 0 && (
        <Button asChild>
          <Link href={`${tableHref}/new`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New row
          </Link>
        </Button>
      )}
    </>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={displayName}
          subtitle={<span className="font-mono">{table.schema}.{table.name}</span>}
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
              <Badge tone="warn" className="!normal-case">view · read-only</Badge>
            )}
            {table.primaryKey.length === 0 && (
              <Badge tone="warn" className="!normal-case">no primary key · edits disabled</Badge>
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
          label="Total rows"
          value={totalCount != null ? totalCount.toLocaleString() : "—"}
          hint={table.kind === "view" ? "read-only" : undefined}
        />
        <StatTile label="Columns" value={table.columns.length} hint={`${analysis?.hiddenColumns?.length ?? 0} hidden`} />
        <StatTile
          label="Foreign keys"
          value={table.columns.filter((c) => c.fk).length}
          hint="linked tables"
        />
        <StatTile
          label="Primary key"
          value={table.primaryKey.length > 0 ? table.primaryKey.length : "—"}
          hint={table.primaryKey.length > 0 ? table.primaryKey.join(", ") : "none"}
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
            placeholder="Search text columns…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search ${table.name}`}
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

      <ul className="grid grid-cols-1 gap-2">
        {isLoading && rows.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-[64px] w-full rounded-md" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
            {debouncedSearch ? (
              <>No rows match <span className="font-mono">{debouncedSearch}</span>.</>
            ) : (
              <>No rows yet.</>
            )}
          </li>
        ) : (
          rows.map((row, idx) => {
            const pkSegment = pkFor(row, table.primaryKey);
            return (
              <GenericRow
                key={`g-${idx}`}
                row={row}
                table={table}
                visibleCols={visibleCols}
                connectionId={connectionId}
                pkSegment={pkSegment}
                isSelected={pkSegment ? selection.isSelected(pkSegment) : false}
                onSelectionToggle={pkSegment ? () => selection.toggle(pkSegment) : undefined}
              />
            );
          })
        )}
      </ul>

      <PaginationBar
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={data?.totalCount ?? totalCount ?? null}
        onPageChange={(p) => {
          const url = new URLSearchParams(sp.toString());
          url.set("page", String(Math.max(1, p)));
          router.push(`?${url.toString()}`);
        }}
      />

      <p className="text-[11px] text-fg-faint">
        {analysis?.notes ? `AI: ${analysis.notes}` : "Generic admin · this table doesn't match a specialized archetype."}
      </p>

      <BulkBar
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />

      <ImportPanel
        open={openImport}
        onClose={() => setOpenImport(false)}
        connectionId={connectionId}
        table={table}
      />
    </div>
  );
}

interface GenericRowProps {
  row: Row;
  table: Table;
  visibleCols: string[];
  connectionId: string;
  pkSegment: string | null;
  isSelected: boolean;
  onSelectionToggle?: () => void;
}

function GenericRow({
  row,
  table,
  visibleCols,
  connectionId,
  pkSegment,
  isSelected,
  onSelectionToggle,
}: GenericRowProps) {
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(table.name)}/${pkSegment}`
    : null;

  // The "lead" value (first visible non-PK column, or the PK if none).
  const leadCol = visibleCols.find((c) => !table.primaryKey.includes(c)) ?? visibleCols[0];
  const leadValue = leadCol ? row[leadCol] : null;
  const leadDisplay =
    leadValue == null
      ? table.primaryKey.length > 0
        ? table.primaryKey.map((c) => String(row[c] ?? "")).join(", ")
        : "row"
      : String(leadValue);

  // The "secondary" cells (the remaining visible cols, rendered as small chips).
  const secondaryCols = visibleCols.filter((c) => c !== leadCol).slice(0, 3);

  return (
    <li>
      <div className={cn(
        "group relative flex items-center gap-3 rounded-md border hairline bg-bg-raised p-3 transition-colors hover:border-line-strong hover:bg-bg-raised/80",
        isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}>
        {onSelectionToggle && (
          <label
            className="pointer-events-auto relative z-20 -m-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={isSelected}
              onChange={onSelectionToggle}
              aria-label={`Select ${leadDisplay}`}
            />
          </label>
        )}
        {detailHref && (
          <Link
            href={detailHref}
            className={cn(
              "absolute right-0 top-0 bottom-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              onSelectionToggle ? "left-11" : "left-0",
            )}
            aria-label={`Open row ${leadDisplay}`}
          />
        )}

        <div className="pointer-events-none relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
          <KeyRound className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
        </div>

        <div className="pointer-events-none relative z-10 min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{leadDisplay}</span>
          </div>
          {secondaryCols.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fg-faint">
              {secondaryCols.map((c) => {
                const col = table.columns.find((tc) => tc.name === c);
                if (!col) return null;
                const v = row[c];
                if (v == null) return null;
                if (col.category === "boolean") {
                  return <StatusPill key={c} value={v ? c : `not ${c}`} />;
                }
                const formatted = formatCellValue(col, v);
                return (
                  <span key={c} className="inline-flex max-w-[20ch] items-center gap-1 truncate">
                    <span className="font-mono text-fg-muted">{c}:</span>
                    <span className="truncate text-fg">{formatted.text}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="pointer-events-auto relative z-20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Actions for ${leadDisplay}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {detailHref && (
                <DropdownMenuItem asChild>
                  <Link href={detailHref}>
                    <ArrowRight className="mr-2 h-3.5 w-3.5" aria-hidden /> Open
                  </Link>
                </DropdownMenuItem>
              )}
              {detailHref && (
                <DropdownMenuItem asChild>
                  <Link href={`${detailHref}?edit=1`}>Edit</Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
