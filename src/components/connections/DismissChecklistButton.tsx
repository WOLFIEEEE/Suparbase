"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/** Dismisses the getting-started checklist (persists on the account). */
export function DismissChecklistButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    try {
      await fetch("/api/account/onboarding/dismiss", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={busy}
      aria-label="Dismiss getting started checklist"
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-bg-raised hover:text-fg disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      Dismiss
    </button>
  );
}
