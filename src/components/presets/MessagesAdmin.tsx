"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CornerDownRight,
  MessageSquare,
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
import { AppError } from "@/lib/errors";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { cn } from "@/lib/ui/cn";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import type { PresetProps } from "./types";

const BODY_PATTERNS = ["body", "content", "text", "message", "comment"];
const AUTHOR_PATTERNS = ["author_id", "user_id", "sender_id", "by_user_id", "posted_by", "created_by"];
const THREAD_PATTERNS = ["parent_id", "thread_id", "conversation_id", "reply_to", "in_reply_to"];
const CREATED_PATTERNS = ["created_at", "inserted_at", "posted_at", "sent_at"];

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

function snippet(value: unknown, max = 220): string {
  if (value == null) return "";
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default function MessagesAdmin(props: PresetProps) {
  return (
    <SelectionProvider>
      <MessagesAdminBody {...props} />
    </SelectionProvider>
  );
}

function MessagesAdminBody({ connectionId, table, analysis }: PresetProps) {
  const canEdit = useCurrentConnection().myRole !== "viewer";
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const bodyCol = primary?.subtitleColumn ?? findColumn(table, BODY_PATTERNS);
  const authorCol = primary?.titleColumn ?? findColumn(table, AUTHOR_PATTERNS);
  const threadCol = findColumn(table, THREAD_PATTERNS);
  const createdCol = findColumn(table, CREATED_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const filters = useMemo(() => parseFilterParams(sp), [sp]);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
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

  // How many of the on-page rows are replies (have a non-null thread/parent).
  const replyCount = useMemo(() => {
    if (!threadCol) return null;
    let n = 0;
    for (const r of rows) if (r[threadCol] != null) n += 1;
    return n;
  }, [rows, threadCol]);

  // Count of unique authors on this page.
  const authorCount = useMemo(() => {
    if (!authorCol) return null;
    const s = new Set<string>();
    for (const r of rows) {
      const v = r[authorCol];
      if (v != null) s.add(String(v));
    }
    return s.size;
  }, [rows, authorCol]);

  const displayName = analysis?.displayName ?? "Conversations";
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
      <PresetSwitcher active="messages" />
      <ExportMenu
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />
      {canEdit && table.kind === "table" && table.primaryKey.length > 0 && (
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
      {canEdit && table.kind === "table" && table.primaryKey.length > 0 && (
        <Button asChild>
          <Link href={`${tableHref}/new`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New message
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
          </span>
        }
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : (
            <>
              <MessageSquare className="h-3 w-3 text-accent" aria-hidden /> Conversations
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
          hint={createdCol ? "newest first" : undefined}
        />
        <StatTile label="On this page" value={rows.length} hint={`page ${page}`} />
        <StatTile
          label="Replies"
          value={replyCount != null ? replyCount : ":"}
          hint={threadCol ? `via ${threadCol}` : "no thread column"}
        />
        <StatTile
          label="Authors"
          value={authorCount != null ? authorCount : ":"}
          hint={authorCol ? "unique on page" : "no author column"}
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
            placeholder="Search messages…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search ${table.name}`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-faint hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <FilterBar table={table} />

      <ul className="space-y-2">
        {isLoading && rows.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i}><Skeleton className="h-[76px] w-full rounded-md" /></li>
          ))
        ) : rows.length === 0 ? (
          <li className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
            {debouncedSearch ? (
              <>No messages match <span className="font-mono">{debouncedSearch}</span>.</>
            ) : (
              <>No messages yet.</>
            )}
          </li>
        ) : (
          rows.map((row, idx) => {
            const pkSegment = pkFor(row, table.primaryKey);
            return (
              <MessageRow
                key={`m-${idx}`}
                row={row}
                connectionId={connectionId}
                tableName={table.name}
                primaryKey={table.primaryKey}
                cols={{
                  body: bodyCol,
                  author: authorCol,
                  thread: threadCol,
                  created: createdCol,
                }}
                isSelected={pkSegment ? selection.isSelected(pkSegment) : false}
                onSelectionToggle={pkSegment ? () => selection.toggle(pkSegment) : undefined}
              />
            );
          })
        )}
      </ul>

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
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: messages / comments / threads"}
      </p>

      <BulkBar
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
        canEdit={canEdit}
      />

      {canEdit && (
        <ImportPanel
          open={openImport}
          onClose={() => setOpenImport(false)}
          connectionId={connectionId}
          table={table}
        />
      )}
    </div>
  );
}

interface MessageRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  cols: {
    body: string | null;
    author: string | null;
    thread: string | null;
    created: string | null;
  };
  isSelected: boolean;
  onSelectionToggle?: () => void;
}

function MessageRow({ row, connectionId, tableName, primaryKey, cols, isSelected, onSelectionToggle }: MessageRowProps) {
  const body = cols.body ? row[cols.body] : null;
  const author = cols.author ? row[cols.author] : null;
  const thread = cols.thread ? row[cols.thread] : null;
  const createdRel = cols.created ? relativeFromNow(row[cols.created] as string) : null;
  const isReply = thread != null;

  const pkSegment = pkFor(row, primaryKey);
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(tableName)}/${pkSegment}`
    : null;

  const bodySnippet = snippet(body);
  const authorLabel = author != null ? String(author).slice(0, 18) : null;
  const display = bodySnippet || authorLabel || (pkSegment ? `#${pkSegment}` : "message");

  return (
    <li>
      <div className={cn(
        "group relative flex items-start gap-3 rounded-md border hairline bg-bg-raised p-3 transition-colors hover:border-line-strong hover:bg-bg-raised/80",
        isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}>
        {onSelectionToggle && (
          <label
            className="pointer-events-auto relative z-20 -m-2 mt-0 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={isSelected}
              onChange={onSelectionToggle}
              aria-label={`Select ${display}`}
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
            aria-label={`Open ${display}`}
          />
        )}
        <div className="pointer-events-none relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
          {isReply ? (
            <CornerDownRight className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
          ) : (
            <MessageSquare className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
          )}
        </div>
        <div className="pointer-events-none relative z-10 min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            {authorLabel != null && (
              <span className="inline-flex items-center gap-1 truncate font-medium text-fg">
                <User className="h-3 w-3 text-fg-faint" aria-hidden /> {authorLabel}
              </span>
            )}
            {isReply && (
              <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
                reply
              </span>
            )}
            {createdRel && <span className="text-fg-faint">{createdRel}</span>}
          </div>
          <p className="text-sm leading-snug text-fg-muted line-clamp-2">
            {bodySnippet || <span className="italic text-fg-faint">no body</span>}
          </p>
        </div>
        <div className="pointer-events-auto relative z-20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-fg-faint transition-opacity hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Actions for ${display}`}
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
