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
import { PLAN_LIMITS, resolvePlan, type ActivePlan } from "./plans";

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
 * Recorded as part of the webhook handler. The handler runs in two
 * idempotency steps:
 *
 *   1. `recordBillingEvent` - insert (or no-op on duplicate). Returns
 *      `alreadyApplied: true` when a prior receipt has already been
 *      acted on, in which case the handler short-circuits 200 OK.
 *      Otherwise the row is in the DB but `applied_at` is still null.
 *
 *   2. `markBillingEventApplied` - set `applied_at = now()` after the
 *      caller has successfully mutated `subscriptions`. If step 2
 *      throws, the next receipt finds `applied_at IS NULL` and re-runs
 *      apply, so transient DB errors don't permanently desync state.
 */
export interface RecordEventInput {
  webhookId: string;
  eventType: string;
  dodoSubscriptionId?: string | null;
  userId?: string | null;
  payload: unknown;
}

export interface RecordEventResult {
  /** True when a fresh row was inserted; false when the webhook id was already known. */
  inserted: boolean;
  /** True when a prior receipt for this webhook id has already been fully applied. */
  alreadyApplied: boolean;
  row: BillingEventRow | null;
}

export async function recordBillingEvent(input: RecordEventInput): Promise<RecordEventResult> {
  // Try the insert first. ON CONFLICT DO NOTHING returns 0 rows when
  // the webhook id is already known, in which case we look up the
  // existing row to see whether the prior receipt was applied.
  const inserted = await db
    .insert(billingEvents)
    .values({
      webhookId: input.webhookId,
      eventType: input.eventType,
      dodoSubscriptionId: input.dodoSubscriptionId ?? null,
      userId: input.userId ?? null,
      payload: input.payload as object,
    })
    .onConflictDoNothing({ target: billingEvents.webhookId })
    .returning();
  if (inserted.length > 0) {
    return { inserted: true, alreadyApplied: false, row: inserted[0]! };
  }
  const existing = await db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.webhookId, input.webhookId))
    .limit(1);
  const row = existing[0] ?? null;
  return {
    inserted: false,
    alreadyApplied: row?.appliedAt != null,
    row,
  };
}

/** Mark an event as successfully applied. Safe to call multiple times. */
export async function markBillingEventApplied(webhookId: string): Promise<void> {
  await db
    .update(billingEvents)
    .set({ appliedAt: new Date() })
    .where(eq(billingEvents.webhookId, webhookId));
}

export async function listRecentBillingEvents(limit = 100): Promise<BillingEventRow[]> {
  return await db
    .select()
    .from(billingEvents)
    .orderBy(desc(billingEvents.receivedAt))
    .limit(limit);
}

/**
 * Events that were received but not (yet) successfully applied.
 * The admin billing page surfaces these so an operator can spot a
 * webhook that failed to mutate `subscriptions`.
 */
export async function listUnappliedBillingEvents(limit = 50): Promise<BillingEventRow[]> {
  return await db
    .select()
    .from(billingEvents)
    .where(sql`${billingEvents.appliedAt} IS NULL`)
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
 * the price catalog (not from per-user discounts. Dodo handles those
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
      // Read from the catalog so a price change in plans.ts is the
      // single source of truth (and the dashboard can't silently lie
      // by stale-hardcoded value).
      if (r.plan === "hosted") {
        mrr += PLAN_LIMITS.hosted.monthlyPriceCents * r.count;
      }
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
 * Count this user's owned connections - used as the gate for the
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
