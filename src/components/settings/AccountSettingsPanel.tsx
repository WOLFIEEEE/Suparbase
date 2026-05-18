"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Download, Mail, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  cancelMyDeletion,
  deleteMyAccount,
} from "@/app/(auth)/(account)/settings/account/actions";

interface Props {
  email: string;
  name: string | null;
  emailVerifiedAt: string | null;
  /** ISO timestamp of when the account is scheduled to be hard-deleted, or null. */
  deletionScheduledAt: string | null;
}

/**
 * Account settings: who you are + the irreversible delete-my-account
 * button. The button cascades through every linked row (connections,
 * subscriptions, agent sessions, etc.) via `ON DELETE CASCADE`. Audit
 * log + billing events keep their rows with NULL user_id for operator
 * forensics. Required for GDPR Art. 17 ("right to be forgotten").
 */
export function AccountSettingsPanel({
  email,
  name,
  emailVerifiedAt,
  deletionScheduledAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deletionPending = deletionScheduledAt
    ? new Date(deletionScheduledAt)
    : null;

  function runDelete() {
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          const result = await deleteMyAccount();
          if (result.ok) {
            toast.success("Account scheduled for deletion.");
            // Hard-replace to clear any cached React Query state then
            // land on the marketing home. User is signed out; they can
            // sign back in any time before the deadline to cancel.
            router.replace("/?deletion=scheduled");
            router.refresh();
            resolve();
          } else {
            toast.error(result.message ?? "Delete failed.");
            reject(new Error(result.message ?? "Delete failed."));
          }
        } catch (e) {
          toast.error((e as Error).message ?? "Network error.");
          reject(e);
        }
      });
    });
  }

  function runCancel() {
    startCancelTransition(async () => {
      try {
        const result = await cancelMyDeletion();
        if (result.ok) {
          toast.success("Deletion cancelled. Your account is safe.");
          router.refresh();
        } else {
          toast.error(result.message ?? "Could not cancel deletion.");
        }
      } catch (e) {
        toast.error((e as Error).message ?? "Network error.");
      }
    });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Account</h1>
        <p className="text-sm text-fg-muted">
          Identity, contact, and the danger-zone controls.
        </p>
      </header>

      {deletionPending && (
        <DeletionPendingBanner
          scheduledFor={deletionPending}
          onCancel={runCancel}
          cancelPending={cancelPending}
        />
      )}

      <EmailVerificationCard email={email} verifiedAt={emailVerifiedAt} />

      <section className="space-y-3">
        <h2 className="font-display text-xl">Security</h2>
        <Link
          href="/settings/account/2fa"
          className="group flex items-center justify-between gap-3 rounded-md border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-fg">Two-factor authentication</p>
              <p className="text-xs text-fg-muted">
                Add a time-based code on top of your password. Required for
                admin accounts.
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
        </Link>
        <ChangePasswordForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Profile</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReadField label="Email" value={email} mono />
          <ReadField label="Display name" value={name ?? "-"} />
        </div>
        <p className="text-xs text-fg-faint">
          To change your email or name, reach out via{" "}
          <Link href="/contact?topic=support" className="text-accent hover:underline">
            our contact form
          </Link>{" "}
          from the address on your account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Export your data</h2>
        <p className="text-xs leading-relaxed text-fg-muted">
          Download a JSON file containing your account record, connection
          metadata, audit log (most recent 100k entries), saved views,
          dashboards, custom actions, and agent sessions. Encrypted columns
          (Supabase keys, Postgres URL, TOTP secret) are excluded - they
          wouldn&apos;t be usable outside this deployment anyway. GDPR Art.
          15 / Art. 20.
        </p>
        <a
          href="/api/account/export"
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download my data (JSON)
        </a>
      </section>

      <section className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-5">
        <h2 className="flex items-center gap-2 font-display text-xl text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Danger zone
        </h2>
        <div className="space-y-2">
          <h3 className="font-medium text-fg">Delete this account</h3>
          <p className="text-xs leading-relaxed text-fg-muted">
            Schedules your account for deletion after a{" "}
            <strong className="text-fg">30-day grace period</strong>. During the
            grace window you can sign back in and cancel from this page. After
            the deadline, your row and every linked record (connections,
            encrypted credentials, saved views, dashboards, custom actions,
            agent sessions, team memberships) are hard-deleted; audit log rows
            are retained anonymised for operator forensics. If you&apos;re on a
            paid plan, cancel via the receipt email{" "}
            <em>before</em> the grace period ends so you stop being charged - we
            don&apos;t auto-cancel Dodo subscriptions on account delete.
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => setConfirmOpen(true)}
          disabled={pending || !!deletionPending}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {deletionPending
            ? "Deletion already scheduled"
            : pending
            ? "Scheduling…"
            : "Delete my account"}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Schedule account for deletion?"
        description={
          <>
            Your account (<strong>{email}</strong>) will be hard-deleted in
            <strong> 30 days</strong>. You&rsquo;ll be signed out immediately;
            sign back in any time before the deadline to cancel. Cancel your
            Dodo subscription separately to stop further charges.
          </>
        }
        confirmLabel="Schedule deletion"
        tone="danger"
        requireText="DELETE MY ACCOUNT"
        onConfirm={runDelete}
      />
    </div>
  );
}

function DeletionPendingBanner({
  scheduledFor,
  onCancel,
  cancelPending,
}: {
  scheduledFor: Date;
  onCancel: () => void;
  cancelPending: boolean;
}) {
  const now = Date.now();
  const msLeft = scheduledFor.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const human = scheduledFor.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const overdue = msLeft <= 0;

  return (
    <section
      role="alert"
      aria-live="polite"
      className="space-y-3 rounded-lg border border-warn/50 bg-warn/10 p-5"
    >
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-fg">
            {overdue
              ? "Your account deletion is processing now."
              : `Account deletion scheduled in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
          </p>
          <p className="text-xs leading-relaxed text-fg-muted">
            {overdue ? (
              <>
                The grace period ended at <strong className="text-fg">{human}</strong>.
                The scheduled retention job will hard-delete your data on its
                next run; sign-in is already locked. If this is a mistake,
                please contact us before the job runs.
              </>
            ) : (
              <>
                On <strong className="text-fg">{human}</strong>, your account
                and every linked record will be permanently deleted. You can
                cancel any time before then.
              </>
            )}
          </p>
        </div>
      </div>
      {!overdue && (
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={cancelPending}
          aria-busy={cancelPending}
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden />
          {cancelPending ? "Cancelling…" : "Cancel deletion"}
        </Button>
      )}
    </section>
  );
}

function ReadField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border hairline bg-bg-raised p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>{value}</p>
    </div>
  );
}

const MIN_PASSWORD = 12;

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    current.length >= 8 && next.length >= MIN_PASSWORD && confirm === next && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? `HTTP ${res.status}`);
        return;
      }
      toast.success("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message ?? "Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-md border hairline bg-bg-raised p-4"
    >
      <div className="flex items-center gap-2">
        <p className="font-medium text-fg">Change password</p>
        <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
          Email + password accounts only
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PasswordField
          label="Current"
          id="pw-current"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
        />
        <PasswordField
          label="New"
          id="pw-new"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          ariaInvalid={tooShort}
          hint={tooShort ? `≥${MIN_PASSWORD} characters` : undefined}
        />
        <PasswordField
          label="Confirm"
          id="pw-confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          ariaInvalid={mismatch}
          hint={mismatch ? "Doesn't match" : undefined}
        />
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}

function PasswordField({
  label,
  id,
  autoComplete,
  value,
  onChange,
  ariaInvalid,
  hint,
}: {
  label: string;
  id: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  ariaInvalid?: boolean;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">{label}</span>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={ariaInvalid}
        className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm focus:border-line-strong focus:outline-none"
      />
      {hint && <span className="block text-[11px] text-danger">{hint}</span>}
    </label>
  );
}

function EmailVerificationCard({
  email,
  verifiedAt,
}: {
  email: string;
  verifiedAt: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    try {
      const res = await fetch("/api/account/verify-email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? `HTTP ${res.status}`);
        return;
      }
      if (data.configured === false) {
        toast.message(
          "Email isn't configured on this deployment. Ask the operator to wire RESEND_API_KEY.",
        );
        return;
      }
      toast.success(`Verification email sent to ${email}.`);
    } catch (e) {
      toast.error((e as Error).message ?? "Network error.");
    } finally {
      setPending(false);
    }
  }

  if (verifiedAt) {
    return (
      <section className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-medium text-fg">Email verified</p>
          <p className="text-xs text-fg-muted">
            <span className="font-mono">{email}</span> was confirmed on{" "}
            {new Date(verifiedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-fg">Verify your email</p>
        <p className="text-xs text-fg-muted">
          We sent a verification link to <span className="font-mono">{email}</span>. Click
          it to confirm ownership before we'll deliver invitations or password-reset emails to
          this address.
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled={pending} onClick={resend}>
        {pending ? "Sending…" : "Resend"}
      </Button>
    </section>
  );
}
