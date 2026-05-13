"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, MoreHorizontal, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
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
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import type { PresetProps } from "./types";

const TITLE_PATTERNS = ["title", "headline", "name", "subject"];
const SLUG_PATTERNS = ["slug", "permalink", "handle"];
const EXCERPT_PATTERNS = ["excerpt", "summary", "subtitle", "description"];
const BODY_PATTERNS = ["body", "content", "markdown", "html"];
const STATUS_PATTERNS = ["status", "state", "published"];
const PUBLISHED_AT_PATTERNS = ["published_at", "publish_date", "released_at", "created_at"];
const AUTHOR_PATTERNS = ["author_id", "user_id", "created_by", "owner_id"];

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

export default function ContentAdmin({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const titleCol =
    primary?.titleColumn ?? analysis?.titleColumn ?? find(table, TITLE_PATTERNS);
  const slugCol = primary?.subtitleColumn ?? find(table, SLUG_PATTERNS);
  const excerptCol = find(table, EXCERPT_PATTERNS) ?? find(table, BODY_PATTERNS);
  const statusCol = primary?.badgeColumn ?? analysis?.statusColumn ?? find(table, STATUS_PATTERNS);
  const publishedAtCol = find(table, PUBLISHED_AT_PATTERNS);
  const authorCol = find(table, AUTHOR_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: publishedAtCol
        ? { column: publishedAtCol, direction: "desc" }
        : undefined,
      search: debouncedSearch || undefined,
    }),
    [page, debouncedSearch, publishedAtCol],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

  const displayName = analysis?.displayName ?? "Content";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;

  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  const draftPublishedSplit = useMemo(() => {
    if (!statusCol) return null;
    let draft = 0;
    let published = 0;
    for (const r of rows) {
      const v = r[statusCol];
      if (v == null) continue;
      const s = String(v).toLowerCase();
      if (s === "published" || s === "true" || v === true) published += 1;
      else if (s === "draft" || s === "false" || v === false) draft += 1;
    }
    return { draft, published };
  }, [rows, statusCol]);

  const headerActions = (
    <>
      <PresetSwitcher active="content" />
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
            New post
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
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Total"
          value={totalCount != null ? totalCount.toLocaleString() : "—"}
          hint={publishedAtCol ? "newest first" : undefined}
        />
        <StatTile
          label="Published"
          value={draftPublishedSplit ? draftPublishedSplit.published : "—"}
          hint={statusCol ? `column: ${statusCol}` : "no status column"}
        />
        <StatTile
          label="Drafts"
          value={draftPublishedSplit ? draftPublishedSplit.draft : "—"}
          hint="on this page"
        />
        <StatTile
          label="Columns"
          value={table.columns.length}
          hint={
            analysis?.hiddenColumns?.length
              ? `${analysis.hiddenColumns.length} hidden`
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            placeholder="Search by title or content…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search content in ${table.name}`}
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

      <ul className="space-y-2">
        {isLoading && rows.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-24 w-full rounded-md" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
            {debouncedSearch ? (
              <>Nothing matches <span className="font-mono">{debouncedSearch}</span>.</>
            ) : (
              <>No content yet. Click "New post" to get started.</>
            )}
          </li>
        ) : (
          rows.map((row, idx) => (
            <ContentRow
              key={`c-${idx}`}
              row={row}
              connectionId={connectionId}
              tableName={table.name}
              primaryKey={table.primaryKey}
              cols={{
                title: titleCol,
                slug: slugCol,
                excerpt: excerptCol,
                status: statusCol,
                publishedAt: publishedAtCol,
                author: authorCol,
              }}
            />
          ))
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
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: content table"}
      </p>
    </div>
  );
}

interface ContentRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  cols: {
    title: string | null;
    slug: string | null;
    excerpt: string | null;
    status: string | null;
    publishedAt: string | null;
    author: string | null;
  };
}

function ContentRow({ row, connectionId, tableName, primaryKey, cols }: ContentRowProps) {
  const title = cols.title ? row[cols.title] : null;
  const slug = cols.slug ? row[cols.slug] : null;
  const excerpt = cols.excerpt ? row[cols.excerpt] : null;
  const status = cols.status ? row[cols.status] : null;
  const publishedAt = cols.publishedAt ? row[cols.publishedAt] : null;
  const author = cols.author ? row[cols.author] : null;
  const displayTitle = title != null ? String(title).trim() : "";
  const safeTitle = displayTitle.length > 0 ? displayTitle : "(untitled)";

  const pkSegment = pkFor(row, primaryKey);
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(tableName)}/${pkSegment}`
    : null;

  const rel = publishedAt ? relativeFromNow(publishedAt as string) : null;

  return (
    <li>
      <div className="group relative flex flex-col gap-2 rounded-md border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong hover:bg-bg-raised/80">
        {detailHref && (
          <Link
            href={detailHref}
            className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`Open ${safeTitle}`}
          />
        )}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate font-display text-lg leading-snug">{safeTitle}</h3>
            {(slug != null || author != null) && (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                {slug != null && (
                  <span className="truncate font-mono text-[11px]">/{String(slug)}</span>
                )}
                {author != null && (
                  <span className="truncate">by {String(author).slice(0, 16)}</span>
                )}
              </div>
            )}
          </div>
          <div className="relative z-20 flex shrink-0 items-center gap-2">
            {typeof status === "boolean" ? (
              <StatusPill value={status ? "published" : "draft"} />
            ) : status != null ? (
              <StatusPill value={String(status)} />
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Actions for ${safeTitle}`}
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
        {excerpt != null && String(excerpt).trim() !== "" && (
          <p className="relative z-10 line-clamp-2 text-sm text-fg-muted">
            {String(excerpt)}
          </p>
        )}
        {rel && (
          <div className="relative z-10 flex items-center gap-1 text-[11px] text-fg-faint">
            <Calendar className="h-3 w-3" aria-hidden /> {rel}
          </div>
        )}
      </div>
    </li>
  );
}
