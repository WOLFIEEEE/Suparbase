import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

/**
 * Subscription tier the user is entitled to. `team` is set manually
 * by an admin (no self-serve checkout for it); `free` is the implicit
 * default when no row exists.
 */
export type Plan = "free" | "hosted" | "team";

/**
 * Dodo Payments + admin-grant lifecycle states. `none` covers the
 * gap between "we created a row" and "the first webhook landed".
 * `on_hold`, `cancelled`, `expired`, `failed` are stored verbatim so
 * the UI can surface them, but plan-resolver maps them all to the
 * `free` entitlement.
 */
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "on_hold"
  | "cancelled"
  | "expired"
  | "failed";

/**
 * One row per user. Created lazily on first paid-feature interaction
 * (checkout kickoff, admin grant, or webhook receipt). The absence
 * of a row is treated as `plan='free'` everywhere.
 *
 * Identifiers from Dodo are stored unique so the webhook handler can
 * match incoming events back to a user without going through
 * `metadata.user_id` every time.
 */
export const subscriptions = pgTable(
  "subscription",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").$type<Plan>().notNull().default("free"),
    status: text("status").$type<SubscriptionStatus>().notNull().default("none"),
    dodoCustomerId: text("dodo_customer_id"),
    dodoSubscriptionId: text("dodo_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** When non-null, the subscription was issued via /admin and isn't backed by a real Dodo charge. */
    grantedByAdmin: uuid("granted_by_admin").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    /** Free-text note from the admin who issued/changed the plan. */
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqDodoCustomer: uniqueIndex("subscription_dodo_customer_unique").on(t.dodoCustomerId),
    uniqDodoSub: uniqueIndex("subscription_dodo_sub_unique").on(t.dodoSubscriptionId),
    byPlan: index("subscription_plan_idx").on(t.plan, t.status),
  }),
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * Append-only log of Dodo webhook receipts. Doubles as the
 * idempotency store: a duplicate `webhook_id` insert conflicts and
 * the handler short-circuits to 200 OK.
 */
export const billingEvents = pgTable(
  "billing_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Standard Webhooks msg id from the `webhook-id` header. */
    webhookId: text("webhook_id").notNull(),
    eventType: text("event_type").notNull(),
    dodoSubscriptionId: text("dodo_subscription_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * When non-null, the handler successfully mutated the
     * `subscriptions` table for this event. Receipt + apply are
     * separate steps so transient apply failures get retried by
     * Dodo (we return 5xx) without losing the dedupe on receipt.
     */
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => ({
    uniqWebhookId: uniqueIndex("billing_event_webhook_id_unique").on(t.webhookId),
    byUser: index("billing_event_user_idx").on(t.userId, t.receivedAt),
    bySub: index("billing_event_sub_idx").on(t.dodoSubscriptionId, t.receivedAt),
    /**
     * Operator-facing: list events that were received but not applied.
     * Partial index - only contains rows where `applied_at IS NULL`,
     * which is the tail we ever query. Cheap to maintain (most rows
     * apply quickly and drop out of the index) and serves the
     * ORDER BY for free.
     */
    byUnapplied: index("billing_event_unapplied_idx")
      .on(t.receivedAt.desc())
      .where(sql`${t.appliedAt} IS NULL`),
  }),
);

export type BillingEventRow = typeof billingEvents.$inferSelect;
