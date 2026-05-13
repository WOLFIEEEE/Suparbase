"use client";
import Link from "next/link";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import type { Table } from "@/lib/types/schema";

interface DataGridToolbarProps {
  table: Table;
  search: string;
  onSearchChange: (value: string) => void;
  pageSize: 10 | 25 | 50 | 100;
  onPageSizeChange: (size: 10 | 25 | 50 | 100) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

export function DataGridToolbar({
  table,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onRefresh,
  isFetching,
}: DataGridToolbarProps) {
  const connectionId = useCurrentConnectionId();
  const canCreate = table.kind === "table" && table.primaryKey.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[16rem] flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
        <Input
          placeholder="Search…"
          className="pl-9 pr-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={`Search in ${table.name}`}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v) as 10 | 25 | 50 | 100)}>
        <SelectTrigger className="w-28" aria-label="Page size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[10, 25, 50, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="secondary" size="md" onClick={onRefresh} disabled={isFetching}>
        <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
        <span className="sr-only">Refresh</span>
      </Button>

      {canCreate && (
        <Button asChild>
          <Link href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}/new`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New row
          </Link>
        </Button>
      )}
    </div>
  );
}
