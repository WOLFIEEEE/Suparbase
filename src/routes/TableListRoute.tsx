import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useRows, useSchema } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { ListParams } from "@/lib/api/rows";
import type { Row } from "@/lib/schema/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { DataGrid } from "@/components/data/DataGrid";
import { DataGridToolbar } from "@/components/data/DataGridToolbar";
import { PaginationBar } from "@/components/data/PaginationBar";
import { RowDrawer } from "@/components/row/RowDrawer";
import { EmptyState } from "@/components/workspace/EmptyState";
import { ErrorBanner } from "@/components/connect/ErrorBanner";
import { AppError } from "@/lib/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@/lib/connection/context";

const PAGE_SIZES = new Set([10, 25, 50, 100]);

function parsePageSize(raw: string | null): 10 | 25 | 50 | 100 {
  const n = Number(raw);
  return (PAGE_SIZES.has(n) ? n : 25) as 10 | 25 | 50 | 100;
}

export function TableListRoute() {
  const { name } = useParams<{ name: string }>();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { connection } = useConnection();
  const { data: schema, isLoading: schemaLoading } = useSchema();

  const table = useMemo(
    () => schema?.tables.find((t) => t.name === name),
    [schema, name],
  );

  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = parsePageSize(params.get("size"));
  const sortRaw = params.get("sort");
  const sort = useMemo<{ column: string; direction: "asc" | "desc" } | null>(() => {
    if (!sortRaw) return null;
    const dotIndex = sortRaw.lastIndexOf(".");
    if (dotIndex < 0) return null;
    const column = sortRaw.slice(0, dotIndex);
    const direction = sortRaw.slice(dotIndex + 1);
    if (direction !== "asc" && direction !== "desc") return null;
    return { column, direction };
  }, [sortRaw]);
  const searchUrl = params.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(searchUrl);
  useEffect(() => setSearchInput(searchUrl), [searchUrl]);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch === searchUrl) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set("q", debouncedSearch);
        else next.delete("q");
        next.set("page", "1");
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, searchUrl, setParams]);

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

  const { data, isLoading, isFetching, error } = useRows(
    table ?? { schema: "public", name: "", columns: [], kind: "table", primaryKey: [], labelColumn: null },
    listParams,
  );

  const setPage = useCallback(
    (newPage: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("page", String(Math.max(1, newPage)));
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const setPageSize = useCallback(
    (size: 10 | 25 | 50 | 100) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("size", String(size));
          next.set("page", "1");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setSort = useCallback(
    (s: { column: string; direction: "asc" | "desc" } | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (s) next.set("sort", `${s.column}.${s.direction}`);
          else next.delete("sort");
          next.set("page", "1");
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  if (schemaLoading) return null;
  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${name}" exists in this project's public schema.`}
        action={
          <Button asChild variant="secondary">
            <Link to="/tables">
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
        to="/tables"
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
                <span>PK: <code className="font-mono">{table.primaryKey.join(", ")}</code></span>
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
            queryKey: ["rows", connection?.hostname, table.schema, table.name],
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
          emptyMessage={
            searchUrl
              ? "No rows match this search."
              : "No rows yet."
          }
        />
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? null}
        onPageChange={setPage}
      />

      <RowDrawer
        table={table}
        row={drawerRow}
        onClose={() => setDrawerRow(null)}
      />
    </div>
  );
}
