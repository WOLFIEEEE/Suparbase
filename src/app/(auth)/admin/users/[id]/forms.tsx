"use client";

import { useState, useTransition } from "react";
import { grantPlanAction, resetSubscriptionAction } from "./actions";

interface GrantProps {
  targetUserId: string;
}

export function GrantPlanForm({ targetUserId }: GrantProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          fd.set("targetUserId", targetUserId);
          const result = await grantPlanAction(fd);
          if (result.ok) {
            setMessage("Plan granted.");
            setTone("ok");
          } else {
            setMessage(result.message ?? "Failed.");
            setTone("err");
          }
        })
      }
      className="space-y-3 rounded-lg border hairline bg-bg-raised p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Plan">
          <select
            name="plan"
            defaultValue="hosted"
            className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm"
          >
            <option value="hosted">Hosted</option>
            <option value="team">Team</option>
          </select>
        </Field>
        <Field label="Expires (optional)">
          <input
            name="expiresAt"
            type="date"
            className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm"
          />
        </Field>
      </div>
      <Field label="Note (visible in admin only)">
        <input
          name="note"
          type="text"
          placeholder="e.g. design partner — comp through 2026-12-31"
          className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm"
        />
      </Field>
      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Grant plan"}
        </button>
        {message && (
          <span className={tone === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

export function ResetSubscriptionForm({ targetUserId }: GrantProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          fd.set("targetUserId", targetUserId);
          const result = await resetSubscriptionAction(fd);
          if (result.ok) {
            setMessage("Reset to Free.");
            setTone("ok");
          } else {
            setMessage(result.message ?? "Failed.");
            setTone("err");
          }
        })
      }
      className="flex items-center justify-between gap-3 rounded-lg border hairline bg-bg-raised p-4"
    >
      <span className="text-xs text-fg-muted">
        Set plan to Free and clear all Dodo identifiers.
      </span>
      <div className="flex items-center gap-3">
        {message && (
          <span className={tone === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>
            {message}
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "…" : "Reset"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">{label}</span>
      {children}
    </label>
  );
}
