"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRows, useSchema } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/data/DataGrid";
import { DataGridToolbar } from "@/components/data/DataGridToolbar";
import { PaginationBar } from "@/components/data/PaginationBar";
import { RowDrawer } from "@/components/row/RowDrawer";
import { EmptyState } from "@/components/workspace/EmptyState";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";

const PAGE_SIZES = new Set([10, 25, 50, 100]);
function parsePageSize(raw: string | null): 10 | 25 | 50 | 100 {
  const n = Number(raw);
  return (PAGE_SIZES.has(n) ? n : 25) as 10 | 25 | 50 | 100;
}

export function TableListView({ tableName }: { tableName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const connectionId = useCurrentConnectionId();
  const qc = useQueryClient();
  const { data: schema, isLoading: schemaLoading } = useSchema(connectionId);

  const table = useMemo(
    () => schema?.tables.find((t) => t.name === tableName),
    [schema, tableName],
  );

  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = parsePageSize(params.get("size"));
  const sortRaw = params.get("sort");
  const sort = useMemo<{ column: string; direction: "asc" | "desc" } | null>(() => {
    if (!sortRaw) return null;
    const dot = sortRaw.lastIndexOf(".");
    if (dot < 0) return null;
    const column = sortRaw.slice(0, dot);
    const direction = sortRaw.slice(dot + 1);
    if (direction !== "asc" && direction !== "desc") return null;
    return { column, direction };
  }, [sortRaw]);
  const searchUrl = params.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(searchUrl);
  useEffect(() => setSearchInput(searchUrl), [searchUrl]);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const writeUrl = useCallback(
    (mutator: (sp: URLSearchParams) => void, opts?: { replace?: boolean }) => {
      const sp = new URLSearchParams(params.toString());
      mutator(sp);
      const target = `?${sp.toString()}`;
      const fn = opts?.replace ? router.replace : router.push;
      fn.call(router, target);
    },
    [params, router],
  );

  useEffect(() => {
    if (debouncedSearch === searchUrl) return;
    writeUrl(
      (sp) => {
        if (debouncedSearch) sp.set("q", debouncedSearch);
        else sp.delete("q");
        sp.set("page", "1");
      },
      { replace: true },
    );
  }, [debouncedSearch, searchUrl, writeUrl]);

  const [drawerRow, setDrawerRow] = useState<Row | null>(null);

  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: sort ?? undefined,
      search: searchUrl || undefined,
    }),
    [page, pageSize, sort, searchUrl],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);

  const setPage = useCallback(
    (newPage: number) =>
      writeUrl((sp) => sp.set("page", String(Math.max(1, newPage)))),
    [writeUrl],
  );
  const setPageSize = useCallback(
    (size: 10 | 25 | 50 | 100) =>
      writeUrl(
        (sp) => {
          sp.set("size", String(size));
          sp.set("page", "1");
        },
        { replace: true },
      ),
    [writeUrl],
  );
  const setSort = useCallback(
    (s: { column: string; direction: "asc" | "desc" } | null) =>
      writeUrl((sp) => {
        if (s) sp.set("sort", `${s.column}.${s.direction}`);
        else sp.delete("sort");
        sp.set("page", "1");
      }),
    [writeUrl],
  );

  if (schemaLoading) return null;
  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${tableName}".`}
        action={
          <Button asChild variant="secondary">
            <Link href={`/c/${connectionId}/tables`}>
              <ChevronLeft className="h-3.5 w-3.5" /> All tables
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/c/${connectionId}/tables`}
        className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> all tables
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-display-md">{table.name}</h1>
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <span>{table.columns.length} columns</span>
            {table.primaryKey.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  PK: <code className="font-mono">{table.primaryKey.join(", ")}</code>
                </span>
              </>
            )}
            {table.kind === "view" && <Badge tone="warn">view</Badge>}
            {table.primaryKey.length === 0 && (
              <Badge tone="warn">no primary key · edits disabled</Badge>
            )}
          </p>
        </div>
      </header>

      <DataGridToolbar
        table={table}
        search={searchInput}
        onSearchChange={setSearchInput}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={() =>
          qc.invalidateQueries({
            queryKey: ["rows", connectionId, table.schema, table.name],
          })
        }
        isFetching={isFetching}
      />

      {error ? (
        <ErrorBanner
          error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
        />
      ) : (
        <DataGrid
          table={table}
          rows={data?.rows ?? []}
          schema={schema!}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(row) => setDrawerRow(row)}
          isLoading={isLoading}
          emptyMessage={searchUrl ? "No rows match this search." : "No rows yet."}
        />
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? null}
        onPageChange={setPage}
      />

      <RowDrawer table={table} row={drawerRow} onClose={() => setDrawerRow(null)} />
    </div>
  );
}
