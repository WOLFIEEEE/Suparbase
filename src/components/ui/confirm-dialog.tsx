"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/ui/cn";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Visible label on the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Visible label on the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Tone of the confirm button. `danger` paints it red. */
  tone?: "primary" | "danger";
  /** When non-empty, the user must type this string into the input to enable the confirm button. */
  requireText?: string;
  /** Called when the user confirms; receives nothing. Throwing rolls the dialog open. */
  onConfirm: () => void | Promise<void>;
  /** Show the AlertTriangle icon next to the title. Defaults to true for `tone="danger"`. */
  icon?: boolean;
}

/**
 * Themed replacement for `window.confirm()`. Use anywhere a
 * destructive or non-trivial confirmation is needed. Supports the
 * "type DELETE to confirm" pattern via `requireText`.
 *
 * Example:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open} onOpenChange={setOpen}
 *     title="Delete bucket"
 *     description="This removes the bucket AND every object inside it."
 *     tone="danger" requireText="DELETE"
 *     onConfirm={() => deleteBucket()}
 *   />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  requireText,
  onConfirm,
  icon,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the typed string + pending flag each time the dialog opens.
  // Without this, a previous confirm leaves stale state behind.
  useEffect(() => {
    if (open) {
      setTyped("");
      setPending(false);
    }
  }, [open]);

  const showIcon = icon ?? tone === "danger";
  const ready = requireText ? typed === requireText : true;

  async function handleConfirm() {
    if (!ready || pending) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller handles error UI (toast etc.). Keep the dialog open.
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", tone === "danger" && "text-danger")}>
            {showIcon && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireText && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-typed" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
              Type <code className="font-mono text-fg">{requireText}</code> to confirm
            </Label>
            <Input
              id="confirm-typed"
              ref={inputRef}
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready) void handleConfirm();
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={!ready || pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
