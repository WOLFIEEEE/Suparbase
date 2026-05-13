import { useState } from "react";
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

interface ServiceRoleWarningProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const PHRASE = "I understand";

export function ServiceRoleWarning({ open, onCancel, onConfirm }: ServiceRoleWarningProps) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === PHRASE;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warn">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <DialogTitle>This is a service-role key.</DialogTitle>
          </div>
          <DialogDescription>
            Service-role keys bypass Row-Level Security and can read and modify
            every row in every table. Use this only on a project you own, on a
            device you trust. The key will be stored in this browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="ack">
            Type <span className="font-mono text-fg">{PHRASE}</span> to continue
          </Label>
          <Input
            id="ack"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            onClick={() => {
              setTyped("");
              onConfirm();
            }}
          >
            Connect anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
