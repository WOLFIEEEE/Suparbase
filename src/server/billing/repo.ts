import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  billingEvents,
  subscriptions,
  type BillingEventRow,
  type Plan,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "@/server/schema";
import { resolvePlan, type ActivePlan } from "./plans";

/**
 * Repo for the `subscriptions` + `billing_events` tables. The repo
 * exposes the small handful of queries the rest of the app needs;
 * downstream callers (routes, admin panel, plan resolver) shouldn't
 * import drizzle directly for billing concerns.
 */

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getActivePlan(userId: string): Promise<ActivePlan> {
  return resolvePlan(await getSubscription(userId));
}

export async function getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<SubscriptionRow | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.dodoSubscriptionId, dodoSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertSubscriptionInput {
  userId: string;
  plan: Plan;
  status: SubscriptionStatus;
  dodoCustomerId?: string | null;
  dodoSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  grantedByAdmin?: string | null;
  adminNote?: string | null;
}

/**
 * Insert or update the subscription row keyed on user_id. Used by
 * the webhook handler (state from Dodo) and by the admin panel
 * (state from operator grants).
 */
export async function upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRow> {
  const now = new Date();
  const values = {
    userId: input.userId,
    plan: input.plan,
    status: input.status,
    dodoCustomerId: input.dodoCustomerId ?? null,
    dodoSubscriptionId: input.dodoSubscriptionId ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    trialEndsAt: input.trialEndsAt ?? null,
    grantedByAdmin: input.grantedByAdmin ?? null,
    grantedAt: input.grantedByAdmin ? now : null,
    adminNote: input.adminNote ?? null,
    updatedAt: now,
  };
  const rows = await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        plan: values.plan,
        status: values.status,
        dodoCustomerId: values.dodoCustomerId,
        dodoSubscriptionId: values.dodoSubscriptionId,
        currentPeriodEnd: values.currentPeriodEnd,
        trialEndsAt: values.trialEndsAt,
        grantedByAdmin: values.grantedByAdmin,
        grantedAt: values.grantedAt,
        adminNote: values.adminNote,
        updatedAt: now,
      },
    })
    .returning();
  return rows[0]!;
}

/**
 * Recorded as part of the webhook handler. The unique index on
 * `webhook_id` is what makes the handler idempotent — a conflict on
 * insert means we've already processed this event.
 */
export interface RecordEventInput {
  webhookId: string;
  eventType: string;
  dodoSubscriptionId?: string | null;
  userId?: string | null;
  payload: unknown;
}

export interface RecordEventResult {
  inserted: boolean;
  row: BillingEventRow | null;
}

export async function recordBillingEvent(input: RecordEventInput): Promise<RecordEventResult> {
  try {
    const rows = await db
      .insert(billingEvents)
      .values({
        webhookId: input.webhookId,
        eventType: input.eventType,
        dodoSubscriptionId: input.dodoSubscriptionId ?? null,
        userId: input.userId ?? null,
        payload: input.payload as object,
      })
      .returning();
    return { inserted: true, row: rows[0]! };
  } catch (e) {
    // Duplicate webhook_id → unique violation → already processed.
    if (isUniqueViolation(e)) return { inserted: false, row: null };
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export async function listRecentBillingEvents(limit = 100): Promise<BillingEventRow[]> {
  return await db
    .select()
    .from(billingEvents)
    .orderBy(desc(billingEvents.receivedAt))
    .limit(limit);
}

export async function listBillingEventsForUser(userId: string, limit = 50): Promise<BillingEventRow[]> {
  return await db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.userId, userId))
    .orderBy(desc(billingEvents.receivedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Aggregate helpers used by /admin
// ---------------------------------------------------------------------------

export interface BillingStats {
  totalSubscriptions: number;
  paidActive: number;
  trialing: number;
  estimatedMonthlyRevenueCents: number;
}

/**
 * Quick aggregate for the admin dashboard. Counts subscriptions that
 * are currently entitled (trialing or active) and projects MRR from
 * the price catalog (not from per-user discounts — Dodo handles those
 * upstream, and we don't store them).
 */
export async function getBillingStats(): Promise<BillingStats> {
  const rows = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      count: sql<number>`count(*)::int`,
    })
    .from(subscriptions)
    .groupBy(subscriptions.plan, subscriptions.status);

  let total = 0;
  let paid = 0;
  let trial = 0;
  let mrr = 0;
  for (const r of rows) {
    total += r.count;
    if (r.status === "active") {
      paid += r.count;
      // Use the catalog price directly. Team is custom-priced;
      // doesn't contribute predictably.
      if (r.plan === "hosted") mrr += 1200 * r.count;
    } else if (r.status === "trialing") {
      trial += r.count;
    }
  }
  return {
    totalSubscriptions: total,
    paidActive: paid,
    trialing: trial,
    estimatedMonthlyRevenueCents: mrr,
  };
}

/**
 * Count this user's owned connections — used as the gate for the
 * Free tier's max-1-connection rule.
 */
export async function countOwnedConnections(userId: string): Promise<number> {
  // Local import to avoid a circular dep with billing.
  const { connections } = await import("@/server/schema");
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connections)
    .where(eq(connections.userId, userId));
  return rows[0]?.count ?? 0;
}

/**
 * Convenience: who owns this Dodo subscription id? Used by the
 * webhook handler when the event arrives without metadata.user_id
 * (typically only happens on renewals).
 */
export async function findUserForDodoSubscription(dodoSubscriptionId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.dodoSubscriptionId, dodoSubscriptionId))
    .limit(1);
  return rows[0]?.userId ?? null;
}

// Re-export common type so callers don't need a second import.
export type { ActivePlan } from "./plans";
export { resolvePlan } from "./plans";
