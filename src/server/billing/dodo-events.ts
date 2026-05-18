import type { Plan, SubscriptionStatus } from "@/server/schema";

/**
 * Pure mapping layer for Dodo webhook events. Extracted from the
 * route handler so it can be unit-tested without a DB or HTTP
 * harness - the handler glues this to upsertSubscription + the
 * idempotency store.
 */

export interface DodoSubscriptionData {
  subscription_id?: string;
  customer_id?: string;
  status?: string;
  current_period_end?: string;
  trial_end?: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
}

export interface DodoWebhookEvent {
  type?: string;
  timestamp?: string;
  business_id?: string;
  data?: DodoSubscriptionData;
}

export interface SubscriptionUpdate {
  plan: Plan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
}

/**
 * Translate a Dodo event into a `subscriptions` row mutation. Returns
 * null when the event type is unrecognised - the caller should record
 * the event for forensics but leave the subscription row alone.
 *
 * `plan` is always `"hosted"` because that's the only product we sell
 * self-serve. The plan doesn't change on expire/cancel - the resolver
 * (`resolvePlan`) downgrades entitlement based on `status` separately.
 */
export function mapDodoEventToUpdate(event: DodoWebhookEvent): SubscriptionUpdate | null {
  const data = event.data ?? {};
  const status = mapStatus(event.type ?? "", data.status);
  if (!status) return null;
  return {
    plan: "hosted",
    status,
    currentPeriodEnd: parseDate(data.current_period_end),
    trialEndsAt: parseDate(data.trial_end),
    dodoCustomerId: data.customer_id ?? null,
    dodoSubscriptionId: data.subscription_id ?? null,
  };
}

/**
 * Public for testing. Translates `(event_type, data.status)` →
 * the SubscriptionStatus column value. Unknown event types return
 * null so the caller can no-op without crashing.
 */
export function mapStatus(
  eventType: string,
  payloadStatus: string | undefined,
): SubscriptionStatus | null {
  switch (eventType) {
    case "subscription.active":
      // `payloadStatus` reflects whether the subscription is in trial
      //. Dodo emits "trialing" via the data.status field.
      if (payloadStatus === "trialing") return "trialing";
      return "active";
    case "subscription.renewed":
    case "subscription.plan_changed":
    case "subscription.updated":
      return payloadStatus === "trialing" ? "trialing" : "active";
    case "subscription.on_hold":
      return "on_hold";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.expired":
      return "expired";
    case "subscription.failed":
      return "failed";
    default:
      return null;
  }
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Notification-only events. These don't mutate `subscriptions` (the
 * subsequent state-change event will), but they DO warrant a user
 * email so the customer knows what happened. Returning `null` from
 * `mapDodoEventToUpdate` for these is correct - the route handler
 * separately checks `mapDodoEventToNotification` and dispatches the
 * email. Keeping them in their own map prevents the state machine
 * from being polluted with side-effect-only branches.
 */
export type BillingNotificationKind =
  | "payment_failed"
  | "payment_refunded"
  | "trial_ending";

export function mapDodoEventToNotification(
  eventType: string,
): BillingNotificationKind | null {
  switch (eventType) {
    case "payment.failed":
      return "payment_failed";
    case "payment.refunded":
      return "payment_refunded";
    case "subscription.trial_ending":
      return "trial_ending";
    default:
      return null;
  }
}
