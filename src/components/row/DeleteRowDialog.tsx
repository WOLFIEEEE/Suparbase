"use client";
import { useEffect, useState } from "react";
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
import { AlertTriangle } from "lucide-react";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { isProduction } from "@/lib/ui/environment";

interface DeleteRowDialogProps {
  open: boolean;
  rowLabel: string;
  tableName: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}

/**
 * Single-row delete confirmation. On a connection labelled `production`
 * the operator has to type the table name first; everywhere else it's a
 * one-click confirm backed by the 5-second undo toast.
 */
export function DeleteRowDialog({
  open,
  rowLabel,
  tableName,
  onCancel,
  onConfirm,
  pending,
}: DeleteRowDialogProps) {
  const connection = useCurrentConnection();
  const guarded = isProduction(connection.environment);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const ready = !guarded || typed === tableName;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
            <DialogTitle>Delete this row?</DialogTitle>
          </div>
          <DialogDescription>
            You&apos;re about to delete{" "}
            <code className="font-mono text-fg">{rowLabel}</code> from{" "}
            <code className="font-mono text-fg">{tableName}</code>. You&apos;ll have
            5 seconds to undo.
            {guarded && (
              <span className="mt-2 block text-danger">
                This connection is labelled <strong>production</strong>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {guarded && (
          <div className="space-y-2">
            <Label htmlFor="delete-row-confirm" className="text-xs text-fg-muted">
              Type <code className="font-mono text-fg">{tableName}</code> to confirm
            </Label>
            <Input
              id="delete-row-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready && !pending) onConfirm();
              }}
              aria-label="Type the table name to confirm delete"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending || !ready}>
            {pending ? "Deleting…" : "Delete row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
