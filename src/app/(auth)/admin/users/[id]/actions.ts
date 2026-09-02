"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/server/admin/guard";
import {
  clearUserEmailSuppression,
  getUserDetail,
  recordAdminAction,
  revokeUserSessions,
} from "@/server/admin/repo";
import {
  getSubscription,
  upsertSubscription,
} from "@/server/billing/repo";
import { log } from "@/server/log";
import { invalidatePasswordChangedCache } from "@/server/auth";
import { parseGrantExpiry } from "@/server/admin/validation";

/**
 * Server actions for the admin user-detail page. Each writes an
 * `admin_action` audit row BEFORE mutating the subscriptions table,
 * so a half-failure leaves a forensic trail.
 */

const GrantSchema = z.object({
  targetUserId: z.string().uuid(),
  plan: z.enum(["hosted", "team"]),
  note: z.string().trim().max(500).optional(),
  // Optional cliff. Open-ended grants leave currentPeriodEnd null.
  expiresAt: z.string().optional(),
});

export async function grantPlanAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const admin = await getAdminSession();
  // Match the layout's surface-invisibility posture: a non-admin
  // probing the action endpoint should see a 404, not an explanatory
  // JSON that confirms the URL exists.
  if (!admin) notFound();

  const parsed = GrantSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    plan: formData.get("plan"),
    note: formData.get("note") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const expiry = parseGrantExpiry(parsed.data.expiresAt);
  if (!expiry.ok) return expiry;
  const expiresAt = expiry.value;

  const target = await getUserDetail(parsed.data.targetUserId);
  if (!target) return { ok: false, message: "User no longer exists." };

  await recordAdminAction({
    adminUserId: admin.userId,
    action: "grant_plan",
    targetUserId: parsed.data.targetUserId,
    details: {
      plan: parsed.data.plan,
      note: parsed.data.note,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  try {
    await upsertSubscription({
      userId: parsed.data.targetUserId,
      plan: parsed.data.plan,
      status: "active",
      currentPeriodEnd: expiresAt,
      grantedByAdmin: admin.userId,
      adminNote: parsed.data.note ?? null,
    });
  } catch (e) {
    log.error("admin grant_plan failed", { err: (e as Error).message, admin: admin.userId });
    return { ok: false, message: "Failed to update subscription." };
  }
  revalidatePath(`/admin/users/${parsed.data.targetUserId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/admin/actions");
  return { ok: true };
}

const ResetSchema = z.object({ targetUserId: z.string().uuid() });

export async function resetSubscriptionAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const admin = await getAdminSession();
  // Match the layout's surface-invisibility posture: a non-admin
  // probing the action endpoint should see a 404, not an explanatory
  // JSON that confirms the URL exists.
  if (!admin) notFound();

  const parsed = ResetSchema.safeParse({ targetUserId: formData.get("targetUserId") });
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }

  const existing = await getSubscription(parsed.data.targetUserId);
  await recordAdminAction({
    adminUserId: admin.userId,
    action: "reset_subscription",
    targetUserId: parsed.data.targetUserId,
    details: {
      previousPlan: existing?.plan ?? null,
      previousStatus: existing?.status ?? null,
    },
  });

  try {
    await upsertSubscription({
      userId: parsed.data.targetUserId,
      plan: "free",
      status: "none",
      currentPeriodEnd: null,
      trialEndsAt: null,
      grantedByAdmin: null,
      adminNote: null,
      dodoCustomerId: null,
      dodoSubscriptionId: null,
    });
  } catch (e) {
    log.error("admin reset_subscription failed", { err: (e as Error).message });
    return { ok: false, message: "Failed to reset subscription." };
  }
  revalidatePath(`/admin/users/${parsed.data.targetUserId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/admin/actions");
  return { ok: true };
}

export async function clearEmailSuppressionAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const admin = await getAdminSession();
  if (!admin) notFound();
  const parsed = ResetSchema.safeParse({ targetUserId: formData.get("targetUserId") });
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  const target = await getUserDetail(parsed.data.targetUserId);
  if (!target) return { ok: false, message: "User no longer exists." };
  if (!target.emailUndeliverableAt) return { ok: false, message: "Email is not suppressed." };

  await recordAdminAction({
    adminUserId: admin.userId,
    action: "clear_email_suppression",
    targetUserId: target.id,
    details: {
      previousReason: target.emailUndeliverableReason,
      suppressedAt: target.emailUndeliverableAt.toISOString(),
    },
  });
  try {
    await clearUserEmailSuppression(target.id);
  } catch (error) {
    log.error("admin clear_email_suppression failed", { err: (error as Error).message });
    return { ok: false, message: "Failed to clear email suppression." };
  }
  revalidateAdminUser(target.id);
  return { ok: true };
}

export async function revokeSessionsAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const admin = await getAdminSession();
  if (!admin) notFound();
  const parsed = ResetSchema.safeParse({ targetUserId: formData.get("targetUserId") });
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  if (parsed.data.targetUserId === admin.userId) {
    return { ok: false, message: "Revoke your own sessions from account settings." };
  }
  const target = await getUserDetail(parsed.data.targetUserId);
  if (!target) return { ok: false, message: "User no longer exists." };

  await recordAdminAction({
    adminUserId: admin.userId,
    action: "revoke_sessions",
    targetUserId: target.id,
    details: { reason: "operator_security_action" },
  });
  try {
    await revokeUserSessions(target.id);
    invalidatePasswordChangedCache(target.id);
  } catch (error) {
    log.error("admin revoke_sessions failed", { err: (error as Error).message });
    return { ok: false, message: "Failed to revoke sessions." };
  }
  revalidateAdminUser(target.id);
  return { ok: true };
}

function revalidateAdminUser(userId: string): void {
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/admin/actions");
  revalidatePath("/admin/operations");
}
