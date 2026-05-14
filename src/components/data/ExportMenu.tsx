"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileJson, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { PrimaryKeyValue, Table } from "@/lib/types/schema";

interface Props {
  connectionId: string;
  table: Table;
  /** Columns to include by default; the user can opt into hidden columns via the toggle. */
  visibleColumns: string[];
  hiddenColumns?: string[];
  /** If supplied, this menu acts as "Export selected": the URL carries `in_pk=…`. */
  selectedPrimaryKeys?: PrimaryKeyValue[];
}

/**
 * Toolbar dropdown that builds an export URL from the current list params
 * and triggers a browser download. No JS-side streaming: `<a href=… download>`
 * lets the browser handle progress, cancel, partial-file persistence.
 */
export function ExportMenu({
  connectionId,
  table,
  visibleColumns,
  hiddenColumns,
  selectedPrimaryKeys,
}: Props) {
  const sp = useSearchParams();
  const [includeHidden, setIncludeHidden] = useState(false);

  const isSelected = Array.isArray(selectedPrimaryKeys) && selectedPrimaryKeys.length > 0;

  function buildUrl(format: "csv" | "json"): string {
    const url = new URLSearchParams();
    url.set("format", format);
    const cols = includeHidden
      ? Array.from(new Set([...visibleColumns, ...(hiddenColumns ?? [])]))
      : visibleColumns;
    if (cols.length > 0) url.set("columns", cols.join(","));

    if (isSelected) {
      // Export-Selected mode: bypass other filters.
      const pkCol = table.primaryKey[0];
      if (pkCol) {
        const values = selectedPrimaryKeys!
          .map((pk) => pk[pkCol])
          .filter((v) => v != null)
          .map((v) => String(v));
        if (values.length > 0) url.set("in_pk", values.join(","));
      }
    } else {
      // Carry forward filters / sort / search from the current URL.
      for (const f of sp.getAll("filter")) url.append("filter", f);
      const order = sp.get("order");
      if (order) url.set("order", order);
      const q = sp.get("q");
      if (q) url.set("q", q);
    }

    return `/api/v/${encodeURIComponent(connectionId)}/rest/${encodeURIComponent(
      table.name,
    )}/export?${url.toString()}`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="md" aria-label="Export">
          <Download className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-fg-faint">
          {isSelected ? `Export ${selectedPrimaryKeys!.length} selected` : "Export current view"}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={buildUrl("csv")} download>
            <FileText className="mr-2 h-3.5 w-3.5 text-fg-muted" aria-hidden />
            Download CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildUrl("json")} download>
            <FileJson className="mr-2 h-3.5 w-3.5 text-fg-muted" aria-hidden />
            Download JSON
          </a>
        </DropdownMenuItem>
        {hiddenColumns && hiddenColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setIncludeHidden((v) => !v);
              }}
              className="cursor-pointer"
            >
              <input
                type="checkbox"
                className="mr-2 h-3.5 w-3.5 cursor-pointer accent-accent"
                checked={includeHidden}
                onChange={() => setIncludeHidden((v) => !v)}
                aria-label="Include hidden columns"
                tabIndex={-1}
              />
              Include {hiddenColumns.length} hidden column{hiddenColumns.length === 1 ? "" : "s"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
