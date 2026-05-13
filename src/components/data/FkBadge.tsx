"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { useReferenceLabels } from "@/lib/api/hooks";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import type { Schema, Table } from "@/lib/types/schema";

interface FkBadgeProps {
  table: Table;
  columnName: string;
  value: unknown;
  allValuesOnPage: unknown[];
  schema: Schema;
}

export function FkBadge({ table, columnName, value, allValuesOnPage, schema }: FkBadgeProps) {
  const connectionId = useCurrentConnectionId();
  const col = table.columns.find((c) => c.name === columnName);
  const fk = col?.fk;
  const valuesKey = useMemo(() => Array.from(new Set(allValuesOnPage)), [allValuesOnPage]);
  const { data: labels } = useReferenceLabels(connectionId, table, columnName, valuesKey, schema);

  if (!fk) return <span className="font-mono text-fg-muted">{String(value)}</span>;
  if (value === null || value === undefined) return <span className="text-fg-faint">—</span>;

  const label = labels?.get(String(value));
  return (
    <Link
      href={`/c/${connectionId}/tables/${encodeURIComponent(fk.table)}/${encodeURIComponent(String(value))}`}
      className="group inline-flex max-w-full items-center gap-1 truncate rounded border border-line/60 bg-bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg hover:border-accent/40 hover:text-accent"
      onClick={(e) => e.stopPropagation()}
    >
      <Link2 className="h-3 w-3 shrink-0 text-fg-faint group-hover:text-accent" aria-hidden />
      <span className="truncate">{label ?? String(value)}</span>
    </Link>
  );
}
