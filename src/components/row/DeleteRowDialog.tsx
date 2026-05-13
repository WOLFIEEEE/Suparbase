import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DeleteRowDialogProps {
  open: boolean;
  rowLabel: string;
  tableName: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function DeleteRowDialog({
  open,
  rowLabel,
  tableName,
  onCancel,
  onConfirm,
  pending,
}: DeleteRowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
            <DialogTitle>Delete this row?</DialogTitle>
          </div>
          <DialogDescription>
            You're about to delete{" "}
            <code className="font-mono text-fg">{rowLabel}</code> from{" "}
            <code className="font-mono text-fg">{tableName}</code>. You'll have
            5 seconds to undo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
