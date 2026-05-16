"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tiny hook to manage ConfirmDialog open-state for call sites that
 * just want to gate a single action behind "are you sure?". Returns
 * an `ask(action)` function — call it from your onClick to open the
 * dialog; pass the props returned from `dialogProps` straight into
 * `<ConfirmDialog {...dialogProps} />`.
 *
 * Pattern intentionally keeps title/description/tone at the call site
 * (so different actions in the same component can have different
 * copy without nesting dialogs).
 *
 * Usage:
 *   const confirm = useConfirm();
 *   <button onClick={() => confirm.ask(() => deleteThing(id))}>Delete</button>
 *   <ConfirmDialog
 *     {...confirm.dialogProps}
 *     title="Delete thing?"
 *     description="This cannot be undone."
 *     tone="danger"
 *     confirmLabel="Delete"
 *   />
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const actionRef = useRef<(() => void | Promise<void>) | null>(null);

  const ask = useCallback((action: () => void | Promise<void>) => {
    actionRef.current = action;
    setOpen(true);
  }, []);

  const onConfirm = useCallback(async () => {
    const action = actionRef.current;
    if (!action) return;
    await action();
  }, []);

  return {
    ask,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      onConfirm,
    } as const,
  };
}
