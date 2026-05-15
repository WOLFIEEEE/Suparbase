import { NextResponse, type NextRequest } from "next/server";
import { DodoError, readDodoConfig, verifyWebhookSignature } from "@/server/billing/dodo";
import {
  findUserForDodoSubscription,
  recordBillingEvent,
  upsertSubscription,
} from "@/server/billing/repo";
import type { Plan, SubscriptionStatus } from "@/server/schema";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/webhooks/dodo
 *
 * Standard Webhooks receiver for Dodo Payments. Verifies the
 * signature, deduplicates on `webhook-id`, then upserts the
 * subscription row based on the event type.
 *
 * This route is intentionally exempt from CSRF: incoming webhooks
 * have no `Origin` header (they're server-to-server). Authenticity
 * is enforced by the HMAC signature instead.
 */
export async function POST(req: NextRequest) {
  const config = readDodoConfig();
  if (!config || !config.webhookSecret) {
    // Fail closed: we'd rather return 503 and have Dodo retry once
    // the secret is in place than silently accept unsigned events.
    log.warn("dodo webhook: not configured");
    return NextResponse.json(
      { category: "not_configured" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = req.headers.get("webhook-signature") ?? "";

  try {
    verifyWebhookSignature({
      secret: config.webhookSecret,
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
    });
  } catch (e) {
    if (e instanceof DodoError) {
      log.warn("dodo webhook: signature rejected", {
        category: e.category,
        webhookId,
      });
      return NextResponse.json({ category: e.category }, { status: 400 });
    }
    log.error("dodo webhook: signature unexpected", { err: (e as Error).message });
    return NextResponse.json({ category: "server" }, { status: 500 });
  }

  let event: DodoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as DodoWebhookEvent;
  } catch {
    log.warn("dodo webhook: non-JSON body");
    return NextResponse.json({ category: "validation" }, { status: 400 });
  }

  const eventType = event.type ?? "unknown";
  const data = event.data ?? {};
  const dodoSubscriptionId = data.subscription_id ?? null;
  const metadataUserId =
    typeof data.metadata?.user_id === "string" ? data.metadata.user_id : null;

  // Resolve the user this event affects. New subscriptions carry the
  // user id in metadata; renewals/expirations only carry the
  // subscription id, so we look it up from the existing row.
  const userId =
    metadataUserId ??
    (dodoSubscriptionId ? await findUserForDodoSubscription(dodoSubscriptionId) : null);

  // Idempotency: the unique index on webhook_id makes duplicate
  // receipts a no-op. Standard Webhooks will retry on any non-2xx,
  // so this matters.
  const recordResult = await recordBillingEvent({
    webhookId,
    eventType,
    dodoSubscriptionId,
    userId,
    payload: event,
  });
  if (!recordResult.inserted) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Without a user we can't update the subscription row. Record the
  // event for forensics and 200 the response so Dodo doesn't retry.
  if (!userId) {
    log.warn("dodo webhook: no user resolved", { eventType, dodoSubscriptionId });
    return NextResponse.json({ ok: true, unmapped: true });
  }

  try {
    await applyEvent({ userId, eventType, data });
  } catch (e) {
    log.error("dodo webhook: apply failed", {
      userId,
      eventType,
      err: (e as Error).message,
    });
    // We've already recorded the event; tell Dodo not to retry. An
    // operator can re-run the apply via the admin panel if needed.
    return NextResponse.json({ ok: true, appliedError: true });
  }
  return NextResponse.json({ ok: true });
}

interface DodoSubscriptionData {
  subscription_id?: string;
  customer_id?: string;
  status?: string;
  current_period_end?: string;
  trial_end?: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
}

interface DodoWebhookEvent {
  type?: string;
  timestamp?: string;
  business_id?: string;
  data?: DodoSubscriptionData;
}

/**
 * Translate a Dodo event into a `subscriptions` row mutation.
 * Anything we don't recognise becomes a no-op (still recorded in
 * `billing_events`, so we can backfill once we extend the switch).
 */
async function applyEvent(input: {
  userId: string;
  eventType: string;
  data: DodoSubscriptionData;
}): Promise<void> {
  const status = mapStatus(input.eventType, input.data.status);
  if (!status) return; // unknown event, leave row untouched

  const currentPeriodEnd = parseDate(input.data.current_period_end);
  const trialEndsAt = parseDate(input.data.trial_end);
  const plan: Plan = "hosted"; // the only product we sell self-serve

  await upsertSubscription({
    userId: input.userId,
    plan: status === "expired" || status === "cancelled" ? plan : plan,
    status,
    dodoCustomerId: input.data.customer_id ?? null,
    dodoSubscriptionId: input.data.subscription_id ?? null,
    currentPeriodEnd,
    trialEndsAt,
  });
}

function mapStatus(
  eventType: string,
  payloadStatus: string | undefined,
): SubscriptionStatus | null {
  switch (eventType) {
    case "subscription.active":
      // `payloadStatus` reflects whether the subscription is in trial
      // — Dodo emits "trialing" via the data.status field.
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
