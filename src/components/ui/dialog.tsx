import { forwardRef, type ElementRef, type ComponentPropsWithoutRef, type HTMLAttributes } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
});

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "center" | "right";
  hideClose?: boolean;
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, side = "center", hideClose, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Common: flex column so children size predictably; min-w-0 lets
          // long unbreakable strings (URLs, SQL, hashes) wrap instead of
          // pushing the dialog wider than its max-w.
          "fixed z-50 flex min-w-0 flex-col surface shadow-2xl outline-none",
          side === "center"
            ? [
                // Width: full width minus a 1rem viewport gutter on each side,
                // capped at max-w-lg by default; callers can pass max-w-md /
                // max-w-2xl / max-w-3xl to override (tailwind-merge wins).
                "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
                // Height: cap at 90vh and scroll internally so long forms
                // (widget editor, action editor, invite dialog) never get
                // clipped off the viewport on short screens.
                "max-h-[90vh] overflow-y-auto overscroll-contain",
                // Chrome
                "gap-3 rounded-lg p-5 sm:p-6",
                // Open/close animation: light scale + fade so it doesn't
                // feel like a snap.
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
              ].join(" ")
            : [
                // Side drawer
                "right-0 top-0 h-full w-full max-w-xl",
                "gap-3 border-l p-5 sm:p-6 overflow-y-auto overscroll-contain",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
              ].join(" "),
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded p-1 text-fg-muted hover:bg-bg-sunken hover:text-fg",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/**
 * Action row. Stays full-width on small screens (buttons stack reversed
 * so the primary CTA is on top) and right-aligns on `sm` and above.
 * Sits flush against the dialog padding; a top hairline divider keeps
 * it visually pinned when the dialog body is long.
 */
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-1 flex flex-col-reverse gap-2 border-t hairline pt-3 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        // Reserve room for the absolute close button on the right.
        "pr-8 font-display text-lg leading-tight tracking-tight",
        className,
      )}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("-mt-1 text-sm leading-relaxed text-fg-muted", className)}
      {...props}
    />
  );
});
