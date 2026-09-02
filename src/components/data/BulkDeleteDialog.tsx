"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { isProduction } from "@/lib/ui/environment";

interface Props {
  open: boolean;
  tableName: string;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}

/**
 * Typed-confirmation dialog for bulk delete. Submit stays disabled until
 * the operator types the exact table name. Same pattern as DeleteRowDialog
 * but elevated to a bulk scope.
 */
export function BulkDeleteDialog({ open, tableName, count, onCancel, onConfirm, pending }: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed === tableName;
  const guarded = isProduction(useCurrentConnection().environment);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTyped("");
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
            <DialogTitle>Delete {count} {count === 1 ? "row" : "rows"}?</DialogTitle>
          </div>
          <DialogDescription>
            You're about to permanently delete <strong>{count}</strong>{" "}
            {count === 1 ? "row" : "rows"} from{" "}
            <code className="font-mono text-fg">{tableName}</code>. You'll have
            5 seconds to undo.
            {guarded && (
              <span className="mt-2 block text-danger">
                This connection is labelled <strong>production</strong>. Double-check the selection.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-delete-confirm" className="text-xs text-fg-muted">
            Type <code className="font-mono text-fg">{tableName}</code> to confirm
          </Label>
          <Input
            id="bulk-delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            aria-label="Type the table name to confirm bulk delete"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setTyped(""); onCancel(); }} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (matches) onConfirm();
            }}
            disabled={!matches || pending}
          >
            {pending ? "Deleting…" : `Delete ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
