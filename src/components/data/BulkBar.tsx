"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBulkDelete, useBulkUpdate, useInsertRow } from "@/lib/api/hooks";
import type { PrimaryKeyValue, Row, Table } from "@/lib/types/schema";
import { decodePkSegment } from "@/lib/table/pk";
import { useSelection } from "./SelectionContext";
import { BulkDeleteDialog } from "./BulkDeleteDialog";
import { BulkUpdatePanel } from "./BulkUpdatePanel";
import { ExportMenu } from "./ExportMenu";
import { AppError } from "@/lib/errors";

interface Props {
  connectionId: string;
  table: Table;
  /** Columns the parent considers visible: used by the Export-Selected menu. */
  visibleColumns?: string[];
  /** Hidden columns the parent's analysis identified: exposed via the export menu toggle. */
  hiddenColumns?: string[];
  canEdit?: boolean;
}

/**
 * Sticky bottom toolbar that appears whenever at least one row is selected.
 * Shows the count, Clear, Delete, Update column, and Export selected.
 */
export function BulkBar({ connectionId, table, visibleColumns, hiddenColumns, canEdit = true }: Props) {
  const { selected, clear } = useSelection();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openUpdate, setOpenUpdate] = useState(false);

  const bulkDelete = useBulkDelete(connectionId, table);
  const bulkUpdate = useBulkUpdate(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);

  if (selected.size === 0) return null;

  // Decode the encoded PK segments back to PrimaryKeyValue objects via the
  // table schema. Selection keys are produced by encodePkSegment(row).
  const primaryKeys: PrimaryKeyValue[] = [];
  for (const key of selected) {
    const decoded = decodePkSegment(table, key);
    if (decoded) primaryKeys.push(decoded);
  }
  const count = primaryKeys.length;
  const isView = table.kind === "view";

  async function runDelete() {
    try {
      const result = await bulkDelete.mutateAsync({ primaryKeys, returnSnapshots: true });
      setConfirmDelete(false);
      clear();
      const snapshots = result.snapshots ?? [];
      toast.success(`Deleted ${result.deleted} ${result.deleted === 1 ? "row" : "rows"} from ${table.name}`, {
        duration: 5000,
        action:
          snapshots.length > 0
            ? {
                label: "Undo",
                onClick: async () => {
                  try {
                    for (const snap of snapshots) {
                      await insertRow.mutateAsync(snap as Row);
                    }
                    toast.success(`Restored ${snapshots.length}`);
                  } catch (e) {
                    const app =
                      e instanceof AppError
                        ? e
                        : new AppError("client_bug", String((e as Error).message ?? e));
                    toast.error(`Could not restore: ${app.message}`);
                  }
                },
              }
            : undefined,
      });
    } catch (e) {
      const app =
        e instanceof AppError
          ? e
          : new AppError("client_bug", String((e as Error).message ?? e));
      toast.error(`Delete failed: ${app.message}`);
      setConfirmDelete(false);
    }
  }

  async function runUpdate(patch: Row) {
    try {
      const result = await bulkUpdate.mutateAsync({ primaryKeys, patch });
      setOpenUpdate(false);
      clear();
      toast.success(`Updated ${result.updated} ${result.updated === 1 ? "row" : "rows"}`);
    } catch (e) {
      const app =
        e instanceof AppError
          ? e
          : new AppError("client_bug", String((e as Error).message ?? e));
      toast.error(`Update failed: ${app.message}`);
    }
  }

  return (
    <>
      <div
        className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border border-line-strong bg-bg-raised/95 px-4 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-bg-raised/80"
        role="region"
        aria-label="Bulk actions"
      >
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent tabular-nums">
            {count}
          </span>
          <span className="text-fg-muted">selected</span>
        </span>
        <span className="h-4 w-px bg-line" aria-hidden />
        {canEdit && !isView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpenUpdate(true)}
            disabled={bulkUpdate.isPending}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Update column
          </Button>
        )}
        {canEdit && !isView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={bulkDelete.isPending}
            className="text-danger hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </Button>
        )}
        <ExportMenu
          connectionId={connectionId}
          table={table}
          visibleColumns={visibleColumns ?? table.columns.map((c) => c.name)}
          hiddenColumns={hiddenColumns}
          selectedPrimaryKeys={primaryKeys}
        />
        <span className="h-4 w-px bg-line" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      </div>

      {canEdit && (
        <>
          <BulkDeleteDialog
            open={confirmDelete}
            tableName={table.name}
            count={count}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={runDelete}
            pending={bulkDelete.isPending}
          />
          <BulkUpdatePanel
            open={openUpdate}
            table={table}
            count={count}
            onCancel={() => setOpenUpdate(false)}
            onConfirm={runUpdate}
            pending={bulkUpdate.isPending}
          />
        </>
      )}
    </>
  );
}
