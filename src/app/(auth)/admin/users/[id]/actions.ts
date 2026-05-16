"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
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

  // `<input type="date">` returns YYYY-MM-DD. Push to 23:59:59 UTC of
  // that day so a grant "through Dec 31" actually entitles the user
  // for the whole of Dec 31 (rather than expiring at the start of it).
  const expiresAt =
    parsed.data.expiresAt && parsed.data.expiresAt.length > 0
      ? endOfDayUtc(parsed.data.expiresAt)
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

function endOfDayUtc(ymd: string): Date {
  // Accept YYYY-MM-DD; reject anything else (defensive — Zod already
  // checked it's a non-empty string but didn't enforce shape).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(Number.NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
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
  return { ok: true };
}
