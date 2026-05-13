import { useMemo } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import type { Row, Schema, Table } from "@/lib/types/schema";
import { formatCellValue } from "@/lib/table/cellFormat";
import { FkBadge } from "./FkBadge";
import { Skeleton } from "@/components/ui/skeleton";

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface DataGridProps {
  table: Table;
  rows: Row[];
  schema: Schema;
  sort: SortState | null;
  onSortChange: (sort: SortState | null) => void;
  onRowClick: (row: Row) => void;
  isLoading: boolean;
  emptyMessage: string;
}

export function DataGrid({
  table,
  rows,
  schema,
  sort,
  onSortChange,
  onRowClick,
  isLoading,
  emptyMessage,
}: DataGridProps) {
  // Per-column values on this page for batched FK lookups.
  const columnValues = useMemo(() => {
    const map = new Map<string, unknown[]>();
    for (const col of table.columns) {
      if (col.fk) map.set(col.name, rows.map((r) => r[col.name]));
    }
    return map;
  }, [table, rows]);

  function cycleSort(colName: string) {
    if (!sort || sort.column !== colName) {
      onSortChange({ column: colName, direction: "asc" });
    } else if (sort.direction === "asc") {
      onSortChange({ column: colName, direction: "desc" });
    } else {
      onSortChange(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded border hairline">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-bg-sunken">
          <tr>
            {table.columns.map((col) => {
              const isPk = col.isPrimaryKey;
              const active = sort?.column === col.name;
              return (
                <th
                  key={col.name}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 select-none border-b hairline bg-bg-sunken px-3 py-2 text-left font-medium",
                    isPk && "text-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort(col.name)}
                    className="group inline-flex items-center gap-1 text-xs uppercase tracking-wide text-fg-muted hover:text-fg"
                    aria-label={`Sort by ${col.name}`}
                  >
                    <span className="font-mono normal-case tracking-normal text-fg">
                      {col.name}
                    </span>
                    {active ? (
                      sort!.direction === "asc" ? (
                        <ArrowUp className="h-3 w-3 text-accent" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-accent" aria-hidden />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40 group-hover:opacity-80" aria-hidden />
                    )}
                  </button>
                  <div className="text-[10px] font-normal text-fg-faint">
                    {col.pgType}
                    {!col.nullable && " · not null"}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b hairline last:border-0">
                {table.columns.map((col) => (
                  <td key={col.name} className="px-3 py-2">
                    <Skeleton className="h-4 w-24" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={table.columns.length}
                className="px-3 py-12 text-center text-sm text-fg-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={primaryKeyKey(table, row, idx)}
                tabIndex={0}
                onClick={() => onRowClick(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                className="cursor-pointer border-b hairline transition-colors last:border-0 hover:bg-bg-raised/60 focus:bg-bg-raised focus:outline-none"
              >
                {table.columns.map((col) => {
                  const value = row[col.name];
                  if (col.fk) {
                    return (
                      <td key={col.name} className="px-3 py-2 align-top">
                        <FkBadge
                          table={table}
                          columnName={col.name}
                          value={value}
                          allValuesOnPage={columnValues.get(col.name) ?? []}
                          schema={schema}
                        />
                      </td>
                    );
                  }
                  const formatted = formatCellValue(col, value);
                  return (
                    <td
                      key={col.name}
                      className={cn(
                        "px-3 py-2 align-top font-mono text-[12px]",
                        formatted.isNull && "text-fg-faint italic",
                        col.isPrimaryKey && "text-accent",
                      )}
                      title={formatted.truncated ? String(value) : undefined}
                    >
                      {col.category === "boolean" && !formatted.isNull ? (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                            value ? "bg-accent/10 text-accent" : "bg-line/40 text-fg-muted",
                          )}
                        >
                          {formatted.text}
                        </span>
                      ) : (
                        formatted.text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function primaryKeyKey(table: Table, row: Row, fallbackIdx: number): string {
  if (table.primaryKey.length === 0) return `row-${fallbackIdx}`;
  return table.primaryKey.map((c) => String(row[c])).join("__");
}
