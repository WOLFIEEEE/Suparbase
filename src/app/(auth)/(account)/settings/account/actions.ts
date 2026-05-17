"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth";
import { deleteUserAccount } from "@/server/auth/delete-account";

/**
 * Server action: delete the currently-signed-in user's account.
 * Verifies the session, runs the cascade, then signs the user out.
 *
 * Defence: only the session.user.id is trusted - the form can't
 * pass an arbitrary user id. The "type DELETE MY ACCOUNT" gate is
 * enforced client-side via ConfirmDialog; server still validates
 * the session as the sole source of truth.
 */
export async function deleteMyAccount(): Promise<{ ok: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Not signed in." };

  const result = await deleteUserAccount(session.user.id);
  if (!result.ok) {
    return { ok: false, message: result.reason };
  }

  // Cookies clear in `signOut` - we don't redirect here because
  // signOut() handles the redirect to "/" via callbackUrl.
  await signOut({ redirect: false });
  // Client component will see ok:true and navigate.
  return { ok: true };
}

// Helper used by the page client to bounce to the landing page after
// signOut. Server actions can't redirect cleanly through useTransition,
// so the client side calls this then navigates.
export async function redirectHome(): Promise<void> {
  redirect("/");
}
