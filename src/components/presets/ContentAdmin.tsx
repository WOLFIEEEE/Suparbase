"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, RefreshCw, Search, X } from "lucide-react";
import { useRows } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { RowDrawer } from "@/components/row/RowDrawer";
import { PresetHeader } from "./shared/PresetHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import type { PresetProps } from "./types";

const TITLE_PATTERNS = ["title", "headline", "name", "subject"];
const EXCERPT_PATTERNS = ["excerpt", "summary", "subtitle", "description"];
const BODY_PATTERNS = ["body", "content", "markdown", "html"];
const STATUS_PATTERNS = ["status", "state", "published"];
const PUBLISHED_AT_PATTERNS = ["published_at", "publish_date", "released_at"];
const AUTHOR_PATTERNS = ["author_id", "user_id", "created_by", "owner_id"];

function find(table: PresetProps["table"], names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

export default function ContentAdmin({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const titleCol = analysis?.titleColumn ?? find(table, TITLE_PATTERNS);
  const excerptCol = find(table, EXCERPT_PATTERNS) ?? find(table, BODY_PATTERNS);
  const statusCol = analysis?.statusColumn ?? find(table, STATUS_PATTERNS);
  const publishedAtCol = find(table, PUBLISHED_AT_PATTERNS);
  const authorCol = find(table, AUTHOR_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
  const sortDir: "desc" | "asc" = "desc";
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: publishedAtCol
        ? { column: publishedAtCol, direction: sortDir }
        : table.columns.find((c) => c.name === "created_at")
          ? { column: "created_at", direction: "desc" }
          : undefined,
      search: debouncedSearch || undefined,
    }),
    [page, debouncedSearch, publishedAtCol, table],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const rows = data?.rows ?? [];
  const [drawerRow, setDrawerRow] = useState<Row | null>(null);

  const displayName = analysis?.displayName ?? "Content";

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
        actions={
          <div className="flex gap-2">
            <PresetSwitcher active="content" />
            {table.kind === "table" && table.primaryKey.length > 0 && (
              <Button asChild>
                <Link href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}/new`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New
                </Link>
              </Button>
            )}
          </div>
        }
      />

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

      <ul className="space-y-2">
        {isLoading && rows.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-20 w-full" />
              </li>
            ))
          : rows.length === 0
          ? (
              <li className="rounded border hairline bg-bg-sunken px-6 py-12 text-center text-sm text-fg-muted">
                {debouncedSearch ? "Nothing matches this search." : "No content yet."}
              </li>
            )
          : rows.map((row, idx) => {
              const title = titleCol ? row[titleCol] : null;
              const excerpt = excerptCol ? row[excerptCol] : null;
              const status = statusCol ? row[statusCol] : null;
              const publishedAt = publishedAtCol ? row[publishedAtCol] : null;
              const author = authorCol ? row[authorCol] : null;
              return (
                <li key={`c-${idx}`}>
                  <button
                    type="button"
                    onClick={() => setDrawerRow(row)}
                    className="flex w-full flex-col gap-2 rounded border hairline bg-bg-raised p-4 text-left transition-colors hover:border-line-strong hover:bg-bg-raised/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="truncate font-display text-lg">{title != null ? String(title) : "(untitled)"}</h3>
                      <div className="flex shrink-0 items-center gap-2">
                        {typeof status === "boolean" ? (
                          <StatusPill value={status ? "published" : "draft"} />
                        ) : status != null ? (
                          <StatusPill value={String(status)} />
                        ) : null}
                      </div>
                    </div>
                    {excerpt != null && String(excerpt).trim() !== "" && (
                      <p className="line-clamp-2 text-sm text-fg-muted">{String(excerpt)}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-faint">
                      {publishedAt != null && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden />
                          {new Date(String(publishedAt)).toLocaleString()}
                        </span>
                      )}
                      {author != null && <span>by {String(author).slice(0, 12)}…</span>}
                    </div>
                  </button>
                </li>
              );
            })}
      </ul>

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
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: content table"}
      </p>

      <RowDrawer table={table} row={drawerRow} onClose={() => setDrawerRow(null)} />
    </div>
  );
}
