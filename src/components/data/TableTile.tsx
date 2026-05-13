"use client";
import Link from "next/link";
import { ArrowUpRight, Eye, Key, Link2 } from "lucide-react";
import { useRowCount } from "@/lib/api/hooks";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import type { Table } from "@/lib/types/schema";
import { Badge } from "@/components/ui/badge";

interface TableTileProps {
  table: Table;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function TableTile({ table }: TableTileProps) {
  const connectionId = useCurrentConnectionId();
  const { data, isLoading } = useRowCount(connectionId, table);
  const fkCount = table.columns.filter((c) => c.fk).length;

  return (
    <Link
      href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`}
      className="group block rounded border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong hover:bg-bg-raised/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-mono text-sm text-fg">{table.name}</h3>
            {table.kind === "view" && (
              <Badge tone="warn">
                <Eye className="h-3 w-3" aria-hidden /> view
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-fg-faint">
            {table.columns.length} column{table.columns.length === 1 ? "" : "s"}
            {table.primaryKey.length > 0 && (
              <>
                {" · "}
                <Key className="inline h-3 w-3 align-text-bottom text-accent" aria-hidden /> {table.primaryKey.join(", ")}
              </>
            )}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-fg-faint">rows</div>
          <div className="font-display text-2xl tabular-nums text-fg">
            {isLoading ? "—" : data?.count != null ? formatCount(data.count) : "—"}
          </div>
        </div>
        {fkCount > 0 && (
          <Badge>
            <Link2 className="h-3 w-3" aria-hidden /> {fkCount} FK
          </Badge>
        )}
      </div>
    </Link>
  );
}
