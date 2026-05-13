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

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const PHRASE = "I understand";

export function ServiceRoleWarning({ open, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === PHRASE;

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
          <div className="flex items-center gap-2 text-warn">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <DialogTitle>This is a service-role key.</DialogTitle>
          </div>
          <DialogDescription>
            Service-role keys bypass Row-Level Security. Anyone who can sign in
            to your Suparbase account will be able to read and write every row
            in every table of this project. The key will be encrypted on our
            server before persisting.
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
          <Button
            variant="ghost"
            onClick={() => {
              setTyped("");
              onCancel();
            }}
          >
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
            Use service-role key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
