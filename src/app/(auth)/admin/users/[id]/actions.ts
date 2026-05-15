"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/server/admin/guard";
import { recordAdminAction } from "@/server/admin/repo";
import {
  getSubscription,
  upsertSubscription,
} from "@/server/billing/repo";
import { log } from "@/server/log";

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
  if (!admin) return { ok: false, message: "Not authorised." };

  const parsed = GrantSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    plan: formData.get("plan"),
    note: formData.get("note") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const expiresAt =
    parsed.data.expiresAt && parsed.data.expiresAt.length > 0
      ? new Date(parsed.data.expiresAt)
      : null;

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
  return { ok: true };
}

const ResetSchema = z.object({ targetUserId: z.string().uuid() });

export async function resetSubscriptionAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, message: "Not authorised." };

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
  return { ok: true };
}
