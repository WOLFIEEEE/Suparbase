"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Clock,
  Kanban,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  User,
  X,
} from "lucide-react";
import { useRows, useRowCount } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { SelectionProvider, useSelection } from "@/components/data/SelectionContext";
import { BulkBar } from "@/components/data/BulkBar";
import { ExportMenu } from "@/components/data/ExportMenu";
import { ImportPanel } from "@/components/data/ImportPanel";
import { FilterBar } from "@/components/data/FilterBar";
import { ViewTabs } from "@/components/data/ViewTabs";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import type { PresetProps } from "./types";

const TITLE_PATTERNS = ["title", "name", "subject", "summary"];
const ASSIGNEE_PATTERNS = ["assignee_id", "assigned_to", "assigned_user_id", "owner_id"];
const PRIORITY_PATTERNS = ["priority", "severity"];
const DUE_PATTERNS = ["due_at", "due_date", "deadline", "due"];
const STATUS_PATTERNS = ["status", "state"];

// Status synonyms collapsed to canonical buckets for display ordering.
const STATUS_BUCKET: Record<string, "todo" | "doing" | "done" | "blocked" | "other"> = {
  todo: "todo",
  "to do": "todo",
  "to_do": "todo",
  open: "todo",
  new: "todo",
  backlog: "todo",
  "in_progress": "doing",
  "in progress": "doing",
  doing: "doing",
  active: "doing",
  started: "doing",
  review: "doing",
  done: "done",
  closed: "done",
  resolved: "done",
  completed: "done",
  blocked: "blocked",
  cancelled: "blocked",
  canceled: "blocked",
};

const BUCKET_LABEL: Record<"todo" | "doing" | "done" | "blocked", string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const BUCKET_ICON = {
  todo: Circle,
  doing: Clock,
  done: CheckCircle2,
  blocked: X,
} as const;

function findColumn(table: PresetProps["table"], names: readonly string[]): string | null {
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

function bucketForStatus(status: unknown): "todo" | "doing" | "done" | "blocked" | "other" {
  if (status == null) return "other";
  const s = String(status).toLowerCase().trim();
  return STATUS_BUCKET[s] ?? "other";
}

export default function TasksAdmin(props: PresetProps) {
  return (
    <SelectionProvider>
      <TasksAdminBody {...props} />
    </SelectionProvider>
  );
}

function TasksAdminBody({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const titleCol = primary?.titleColumn ?? findColumn(table, TITLE_PATTERNS);
  const statusCol = primary?.badgeColumn ?? analysis?.statusColumn ?? findColumn(table, STATUS_PATTERNS);
  const assigneeCol = findColumn(table, ASSIGNEE_PATTERNS);
  const priorityCol = primary?.subtitleColumn ?? findColumn(table, PRIORITY_PATTERNS);
  const dueCol = findColumn(table, DUE_PATTERNS);
  const createdCol = findColumn(table, ["created_at", "inserted_at"]);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const filters = useMemo(() => parseFilterParams(sp), [sp]);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 50 as const;
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: createdCol ? { column: createdCol, direction: "desc" } : undefined,
      search: debouncedSearch || undefined,
      filters,
    }),
    [page, debouncedSearch, createdCol, filters],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

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

  // Group by canonical status bucket for the display.
  const grouped = useMemo(() => {
    if (!statusCol) return null;
    const out = {
      todo: [] as Row[],
      doing: [] as Row[],
      done: [] as Row[],
      blocked: [] as Row[],
      other: [] as Row[],
    };
    for (const r of rows) {
      out[bucketForStatus(r[statusCol])].push(r);
    }
    return out;
  }, [rows, statusCol]);

  const displayName = analysis?.displayName ?? "Tasks";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  const visibleCols = (analysis?.listColumns?.length
    ? analysis.listColumns
    : table.columns.map((c) => c.name)
  ).filter((c) => !(analysis?.hiddenColumns ?? []).includes(c));

  const [openImport, setOpenImport] = useState(false);

  const headerActions = (
    <>
      <PresetSwitcher active="tasks" />
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
            New task
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

  const renderRow = (r: Row, idx: number, keyPrefix: string) => {
    const pkSegment = pkFor(r, table.primaryKey);
    return (
      <TaskRow
        key={`${keyPrefix}-${idx}`}
        row={r}
        connectionId={connectionId}
        tableName={table.name}
        primaryKey={table.primaryKey}
        cols={{
          title: titleCol,
          status: statusCol,
          assignee: assigneeCol,
          priority: priorityCol,
          due: dueCol,
        }}
        selectionKey={pkSegment}
        isSelected={pkSegment ? selection.isSelected(pkSegment) : false}
        onSelectionToggle={pkSegment ? () => selection.toggle(pkSegment) : undefined}
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={displayName}
        subtitle={
          <span className="inline-flex items-center gap-2 font-mono text-xs">
            {table.schema}.{table.name}
          </span>
        }
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : (
            <>
              <Kanban className="h-3 w-3 text-accent" aria-hidden /> Workflow
            </>
          )
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
          label="Total"
          value={totalCount != null ? totalCount.toLocaleString() : ":"}
        />
        <StatTile
          label="To do"
          value={grouped ? grouped.todo.length : ":"}
          hint="on this page"
        />
        <StatTile
          label="In progress"
          value={grouped ? grouped.doing.length : ":"}
          hint="on this page"
        />
        <StatTile
          label="Done"
          value={grouped ? grouped.done.length : ":"}
          hint="on this page"
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
            placeholder="Search tasks…"
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

      {isLoading && rows.length === 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}><Skeleton className="h-[60px] w-full rounded-md" /></li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
          {debouncedSearch ? <>No tasks match.</> : <>No tasks yet.</>}
        </div>
      ) : grouped ? (
        // Grouped by status
        <div className="space-y-6">
          {(["todo", "doing", "done", "blocked", "other"] as const).map((bucket) => {
            const list = grouped[bucket];
            if (list.length === 0) return null;
            const Icon = bucket === "other" ? Circle : BUCKET_ICON[bucket];
            const label = bucket === "other" ? "Other" : BUCKET_LABEL[bucket];
            return (
              <section key={bucket}>
                <h2 className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  <Icon className="h-3 w-3" aria-hidden />
                  {label}
                  <span className="text-fg-faint">· {list.length}</span>
                </h2>
                <ul className="space-y-2">
                  {list.map((r, i) => renderRow(r, i, bucket))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        // No status column → flat list
        <ul className="space-y-2">
          {rows.map((r, i) => renderRow(r, i, "flat"))}
        </ul>
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
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: tasks / workflow"}
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

interface TaskRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  cols: {
    title: string | null;
    status: string | null;
    assignee: string | null;
    priority: string | null;
    due: string | null;
  };
  selectionKey: string | null;
  isSelected: boolean;
  onSelectionToggle?: () => void;
}

function TaskRow({ row, connectionId, tableName, primaryKey, cols, isSelected, onSelectionToggle }: TaskRowProps) {
  const title = cols.title ? row[cols.title] : null;
  const status = cols.status ? row[cols.status] : null;
  const assignee = cols.assignee ? row[cols.assignee] : null;
  const priority = cols.priority ? row[cols.priority] : null;
  const dueRaw = cols.due ? row[cols.due] : null;
  const dueRel = dueRaw ? relativeFromNow(dueRaw as string) : null;
  const pkSegment = pkFor(row, primaryKey);
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(tableName)}/${pkSegment}`
    : null;
  const displayTitle =
    title != null ? String(title) : pkSegment ? `#${pkSegment}` : "task";

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
              aria-label={`Select ${displayTitle}`}
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
            aria-label={`Open ${displayTitle}`}
          />
        )}
        <div className="pointer-events-none relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
          <Kanban className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        </div>
        <div className="pointer-events-none relative z-10 min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{displayTitle}</span>
            {status != null && <StatusPill value={String(status)} />}
          </div>
          <div className="flex flex-wrap items-center gap-3 truncate text-xs text-fg-muted">
            {assignee != null && (
              <span className="inline-flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />
                {String(assignee).slice(0, 16)}
              </span>
            )}
            {priority != null && (
              <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
                {String(priority)}
              </span>
            )}
            {dueRel && (
              <span className="inline-flex items-center gap-1 text-fg-faint">
                <Clock className="h-3 w-3" aria-hidden /> due {dueRel}
              </span>
            )}
          </div>
        </div>
        <div className="pointer-events-auto relative z-20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Actions for ${displayTitle}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {detailHref && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={detailHref}>Open</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`${detailHref}?edit=1`}>Edit</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
