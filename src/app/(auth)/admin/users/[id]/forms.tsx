"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  clearEmailSuppressionAction,
  grantPlanAction,
  resetSubscriptionAction,
  revokeSessionsAction,
} from "./actions";

// Auto-clear inline status messages so stale "Plan granted" copy
// doesn't linger next to the button when an admin returns later.
function useAutoClear(value: string | null, setValue: (v: string | null) => void, delayMs = 4000) {
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), delayMs);
    return () => clearTimeout(t);
  }, [value, setValue, delayMs]);
}

interface GrantProps {
  targetUserId: string;
}

export function GrantPlanForm({
  targetUserId,
  currentPlan = "hosted",
  currentExpiry,
  currentNote,
}: GrantProps & { currentPlan?: string; currentExpiry?: Date | null; currentNote?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | null>(null);
  useAutoClear(message, setMessage);

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
            defaultValue={currentPlan === "team" ? "team" : "hosted"}
            className="h-10 w-full rounded-md border hairline bg-bg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <option value="hosted">Hosted</option>
            <option value="team">Team</option>
          </select>
        </Field>
        <Field label="Expires (optional)">
          <input
            name="expiresAt"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            defaultValue={currentExpiry ? new Date(currentExpiry).toISOString().slice(0, 10) : undefined}
            className="h-10 w-full rounded-md border hairline bg-bg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          />
        </Field>
      </div>
      <Field label="Note (visible in admin only)">
        <input
          name="note"
          type="text"
          defaultValue={currentNote ?? ""}
          maxLength={500}
          placeholder="e.g. design partner - comp through 2026-12-31"
          className="h-10 w-full rounded-md border hairline bg-bg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        />
      </Field>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Grant plan"}
        </button>
        {message && (
          <span role="status" aria-live="polite" className={tone === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  useAutoClear(message, setMessage);

  function runReset() {
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("targetUserId", targetUserId);
        const result = await resetSubscriptionAction(fd);
        if (result.ok) {
          setMessage("Reset to Free.");
          setTone("ok");
          resolve();
        } else {
          setMessage(result.message ?? "Failed.");
          setTone("err");
          reject(new Error(result.message ?? "Failed."));
        }
      });
    });
  }

  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:flex-row sm:items-center">
      <span className="text-xs text-fg-muted">
        Set plan to Free and clear all Dodo identifiers.
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {message && (
          <span role="status" aria-live="polite" className={tone === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>
            {message}
          </span>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-danger/40 px-3 text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "…" : "Reset"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset this subscription?"
        description={
          <>
            Sets the user&apos;s plan to <strong>Free</strong> and clears all Dodo
            identifiers (<code>dodo_customer_id</code>, <code>dodo_subscription_id</code>,
            cliff dates). Use only when you&apos;ve already cancelled on Dodo&apos;s
            side - otherwise the next webhook will re-create the row.
          </>
        }
        confirmLabel="Reset to Free"
        tone="danger"
        requireText="RESET"
        onConfirm={runReset}
      />
    </div>
  );
}

export function SupportSecurityActions({
  targetUserId,
  emailSuppressed,
  isSelf,
}: GrantProps & { emailSuppressed: boolean; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"email" | "sessions" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err">("ok");
  useAutoClear(message, setMessage);

  function run(action: "email" | "sessions") {
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("targetUserId", targetUserId);
        const result = action === "email"
          ? await clearEmailSuppressionAction(fd)
          : await revokeSessionsAction(fd);
        if (result.ok) {
          setMessage(action === "email" ? "Email suppression cleared." : "All sessions revoked.");
          setTone("ok");
          resolve();
        } else {
          setMessage(result.message ?? "Action failed.");
          setTone("err");
          reject(new Error(result.message ?? "Action failed."));
        }
      });
    });
  }

  return (
    <div className="space-y-3 rounded-lg border hairline bg-bg-raised p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDialog("email")}
          disabled={pending || !emailSuppressed}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md border hairline px-3 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Clear email suppression
        </button>
        <button
          type="button"
          onClick={() => setDialog("sessions")}
          disabled={pending || isSelf}
          title={isSelf ? "Use account settings to revoke your own sessions." : undefined}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-danger/40 px-3 text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Revoke all sessions
        </button>
      </div>
      <p className="text-[11px] leading-5 text-fg-faint">
        Clearing suppression permits future transactional sends. Session revocation invalidates every JWT issued before this action within the cache window.
      </p>
      {message && <p role="status" aria-live="polite" className={tone === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>{message}</p>}
      <ConfirmDialog open={dialog === "email"} onOpenChange={(open) => setDialog(open ? "email" : null)} title="Clear email suppression?" description="Only continue after the customer confirms the address is valid. A new hard bounce or complaint will suppress it again." confirmLabel="Clear suppression" onConfirm={() => run("email")} />
      <ConfirmDialog open={dialog === "sessions"} onOpenChange={(open) => setDialog(open ? "sessions" : null)} title="Revoke every session?" description="The customer will be signed out on their next authenticated request and must sign in again. Use this for suspected account compromise." confirmLabel="Revoke sessions" tone="danger" requireText="REVOKE" onConfirm={() => run("sessions")} />
    </div>
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
