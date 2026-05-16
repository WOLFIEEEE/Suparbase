"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteMyAccount } from "@/app/(auth)/(account)/settings/account/actions";

interface Props {
  email: string;
  name: string | null;
}

/**
 * Account settings: who you are + the irreversible delete-my-account
 * button. The button cascades through every linked row (connections,
 * subscriptions, agent sessions, etc.) via `ON DELETE CASCADE`. Audit
 * log + billing events keep their rows with NULL user_id for operator
 * forensics. Required for GDPR Art. 17 ("right to be forgotten").
 */
export function AccountSettingsPanel({ email, name }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function runDelete() {
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          const result = await deleteMyAccount();
          if (result.ok) {
            toast.success("Account deleted.");
            // Hard-replace to clear any cached React Query state then
            // land on the marketing home.
            router.replace("/");
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

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Account</h1>
        <p className="text-sm text-fg-muted">
          Identity, contact, and the danger-zone controls.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Profile</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReadField label="Email" value={email} mono />
          <ReadField label="Display name" value={name ?? "—"} />
        </div>
        <p className="text-xs text-fg-faint">
          To change your email or name, email{" "}
          <a href="mailto:contact@suparbase.com" className="text-accent hover:underline">
            contact@suparbase.com
          </a>{" "}
          from the address on your account.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-5">
        <h2 className="flex items-center gap-2 font-display text-xl text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Danger zone
        </h2>
        <div className="space-y-2">
          <h3 className="font-medium text-fg">Delete this account</h3>
          <p className="text-xs leading-relaxed text-fg-muted">
            Removes you, your saved Supabase connections, encrypted credentials,
            saved views, dashboards, custom actions, agent sessions, and team
            memberships. <strong className="text-fg">This cannot be undone.</strong>{" "}
            Audit log rows are retained without your user id for operator
            forensics. If you&apos;re on a paid plan, cancel via the receipt
            email <em>before</em> deleting so you stop being charged — we
            don&apos;t auto-cancel Dodo subscriptions on account delete.
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete account?"
        description={
          <>
            Permanently removes <strong>{email}</strong> and every Suparbase row
            tied to it. Cannot be undone. Cancel any active Dodo subscription
            first to stop further charges.
          </>
        }
        confirmLabel="Delete my account"
        tone="danger"
        requireText="DELETE MY ACCOUNT"
        onConfirm={runDelete}
      />
    </div>
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
