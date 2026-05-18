"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth";
import {
  cancelScheduledDeletion,
  scheduleAccountDeletion,
} from "@/server/auth/delete-account";

/**
 * Server action: schedule the currently-signed-in user's account for
 * deletion. Soft-deletes with a 30-day grace period; the user can
 * still sign in and cancel until the deadline, after which the cron
 * job hard-deletes (cascades wipe everything except set-null audit
 * rows for operator forensics).
 *
 * Defence: only the session.user.id is trusted - the form can't
 * pass an arbitrary user id. The "type DELETE MY ACCOUNT" gate is
 * enforced client-side via ConfirmDialog; server still validates
 * the session as the sole source of truth.
 */
export async function deleteMyAccount(): Promise<{
  ok: boolean;
  message?: string;
  scheduledFor?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Not signed in." };

  const result = await scheduleAccountDeletion(session.user.id);
  if (!result.ok) {
    return { ok: false, message: result.reason };
  }

  // Cookies clear in `signOut` - we don't redirect here because
  // signOut() handles the redirect to "/" via callbackUrl.
  await signOut({ redirect: false });
  return {
    ok: true,
    scheduledFor: result.scheduledFor?.toISOString(),
  };
}

/**
 * Server action: cancel a pending account deletion. Idempotent -
 * clears `deletion_scheduled_at` if it's set, no-op if not. The user
 * stays signed in afterwards.
 */
export async function cancelMyDeletion(): Promise<{
  ok: boolean;
  message?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Not signed in." };
  const result = await cancelScheduledDeletion(session.user.id);
  if (!result.ok) {
    return { ok: false, message: result.reason };
  }
  return { ok: true };
}

// Helper used by the page client to bounce to the landing page after
// signOut. Server actions can't redirect cleanly through useTransition,
// so the client side calls this then navigates.
export async function redirectHome(): Promise<void> {
  redirect("/");
}
