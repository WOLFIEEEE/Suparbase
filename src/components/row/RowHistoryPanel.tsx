"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, History, Loader2, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUpdateRow } from "@/lib/api/hooks";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { PrimaryKeyValue, Row, Table } from "@/lib/types/schema";

interface HistoryEntry {
  id: string;
  verb: "insert" | "update" | "delete";
  createdAt: string;
  httpStatus: number;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
}

interface Props {
  connectionId: string;
  table: Table;
  pk: PrimaryKeyValue | null;
}

async function fetchRowHistory(
  connectionId: string,
  tableName: string,
  pk: Record<string, unknown>,
): Promise<HistoryEntry[]> {
  const url = `/api/v/${encodeURIComponent(connectionId)}/audit/row?table=${encodeURIComponent(
    tableName,
  )}&pk=${encodeURIComponent(JSON.stringify(pk))}`;
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to load history.");
  }
  const data = (await res.json()) as { entries: HistoryEntry[] };
  return data.entries ?? [];
}

const VERB_TONE: Record<HistoryEntry["verb"], string> = {
  insert: "bg-accent/10 text-accent",
  update: "bg-warn/10 text-warn",
  delete: "bg-danger/10 text-danger",
};

const VERB_LABEL: Record<HistoryEntry["verb"], string> = {
  insert: "created",
  update: "updated",
  delete: "deleted",
};

/**
 * Values from a snapshot that can be written back: known columns only,
 * minus the primary key and generated columns. Returns null when the
 * snapshot carries nothing restorable.
 */
function restorablePatch(table: Table, snapshot: Row): Row | null {
  const pk = new Set(table.primaryKey);
  const patch: Row = {};
  for (const col of table.columns) {
    if (pk.has(col.name) || col.isGenerated) continue;
    if (!(col.name in snapshot)) continue;
    patch[col.name] = snapshot[col.name];
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Chronological audit-log feed for a single row, with a column-level diff
 * computed by comparing each entry's `afterRow` against the previous entry's
 * snapshot (or `beforeRow` on a delete). Older snapshots can be written
 * back with "Restore this version". Lives in the right rail of detail pages.
 */
export function RowHistoryPanel({ connectionId, table, pk }: Props) {
  const enabled = pk !== null;
  const qc = useQueryClient();
  const queryKey = ["rowHistory", connectionId, table.schema, table.name, pk];
  const { data, isLoading, error } = useQuery<HistoryEntry[]>({
    queryKey,
    queryFn: () => fetchRowHistory(connectionId, table.name, pk!),
    enabled,
    staleTime: 15_000,
  });
  const canRestore =
    useCurrentConnection().myRole !== "viewer" && table.kind === "table" && pk !== null;
  const update = useUpdateRow(connectionId, table);
  const [pendingRestore, setPendingRestore] = useState<HistoryEntry | null>(null);

  async function performRestore() {
    if (!pendingRestore || !pk) return;
    const patch = restorablePatch(table, pendingRestore.afterRow ?? {});
    if (!patch) {
      toast.info("Nothing restorable in that version.");
      return;
    }
    try {
      await update.mutateAsync({ pk, patch });
      toast.success(`Restored the version from ${relativeFromNow(pendingRestore.createdAt) ?? "earlier"}`);
      void qc.invalidateQueries({ queryKey });
    } catch (e) {
      const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
      toast.error(`Restore failed: ${app.message}`);
      throw e;
    }
  }

  return (
    <section className="surface rounded-md p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        <History className="h-3 w-3" aria-hidden /> History
      </h3>
      {!enabled ? (
        <p className="text-xs text-fg-muted">No primary key on this row: history isn&apos;t tracked.</p>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <p className="text-xs text-danger">{(error as AppError).message ?? "Couldn't load history."}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-fg-muted leading-relaxed">
          No history yet. Edits made here will start appearing as soon as the
          row is changed.
        </p>
      ) : (
        <ol className="space-y-2">
          {data.map((entry, i) => (
            <HistoryItem
              key={entry.id}
              entry={entry}
              previousAfter={data[i + 1]?.afterRow ?? data[i + 1]?.beforeRow ?? null}
              onRestore={
                // The newest entry IS the current state; older snapshots
                // with an afterRow can be written back.
                canRestore && i > 0 && entry.afterRow && restorablePatch(table, entry.afterRow)
                  ? () => setPendingRestore(entry)
                  : undefined
              }
            />
          ))}
        </ol>
      )}
      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRestore(null);
        }}
        title="Restore this version?"
        description={
          pendingRestore
            ? `Every editable column will be set back to its value from ${relativeFromNow(pendingRestore.createdAt) ?? "that point"}. The change is written through the normal proxy, so it shows up in history and can itself be restored.`
            : undefined
        }
        confirmLabel="Restore"
        icon={false}
        onConfirm={performRestore}
      />
    </section>
  );
}

interface HistoryItemProps {
  entry: HistoryEntry;
  previousAfter: Record<string, unknown> | null;
  onRestore?: () => void;
}

function HistoryItem({ entry, previousAfter, onRestore }: HistoryItemProps) {
  const [open, setOpen] = useState(false);
  const rel = relativeFromNow(entry.createdAt);
  const diff = computeDiff(entry, previousAfter);

  return (
    <li className="rounded border hairline bg-bg-raised/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-fg-muted hover:text-fg"
        aria-expanded={open}
      >
        {diff.length > 0 ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
            VERB_TONE[entry.verb],
          )}
        >
          {VERB_LABEL[entry.verb]}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {diff.length === 0 ? (
            <span className="text-fg-faint">
              {entry.verb === "insert" ? "created" : entry.verb === "delete" ? "deleted" : "updated"}
            </span>
          ) : (
            <span>
              {diff.length} {diff.length === 1 ? "column" : "columns"}{" "}
              <span className="text-fg-faint">changed</span>
            </span>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-fg-faint">{rel ?? ""}</span>
      </button>
      {open && diff.length > 0 && (
        <div className="space-y-1 border-t hairline px-2.5 py-2 text-[11px]">
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="mb-1 inline-flex items-center gap-1 rounded border hairline px-2 py-0.5 text-[10px] text-fg-muted hover:border-line-strong hover:text-fg"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Restore this version
            </button>
          )}
          {diff.map((d) => (
            <div key={d.column} className="flex items-baseline gap-1 font-mono">
              <span className="text-fg-muted">{d.column}</span>
              <span className="text-fg-faint">:</span>
              {d.kind === "added" ? (
                <span className="text-accent">+{prettyValue(d.value)}</span>
              ) : d.kind === "removed" ? (
                <span className="text-danger line-through">{prettyValue(d.value)}</span>
              ) : (
                <>
                  <span className="text-danger line-through">{prettyValue(d.from)}</span>
                  <span className="text-fg-faint">→</span>
                  <span className="text-accent">{prettyValue(d.to)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

interface DiffEntry {
  column: string;
  kind: "added" | "removed" | "changed";
  value?: unknown;
  from?: unknown;
  to?: unknown;
}

function computeDiff(entry: HistoryEntry, previousAfter: Record<string, unknown> | null): DiffEntry[] {
  if (entry.verb === "insert") {
    if (!entry.afterRow) return [];
    return Object.entries(entry.afterRow)
      .filter(([, v]) => v != null)
      .map(([column, value]) => ({ column, kind: "added", value }));
  }
  if (entry.verb === "delete") {
    if (!entry.beforeRow) return [];
    return Object.entries(entry.beforeRow)
      .filter(([, v]) => v != null)
      .map(([column, value]) => ({ column, kind: "removed", value }));
  }
  // update: compare afterRow against previousAfter (or before if available)
  const before = previousAfter ?? entry.beforeRow ?? {};
  const after = entry.afterRow ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: DiffEntry[] = [];
  for (const k of keys) {
    if (sameVal(before[k], after[k])) continue;
    out.push({ column: k, kind: "changed", from: before[k], to: after[k] });
  }
  return out;
}

function sameVal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

function prettyValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 40 ? s.slice(0, 40) + "…" : s;
  } catch {
    return String(v);
  }
}

// Loader badge re-export to keep the surface explicit
export const HistoryLoader = Loader2;
