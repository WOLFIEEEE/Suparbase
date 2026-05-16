import { NextResponse, type NextRequest } from "next/server";
import { DodoError, readDodoConfig, verifyWebhookSignature } from "@/server/billing/dodo";
import {
  findUserForDodoSubscription,
  markBillingEventApplied,
  recordBillingEvent,
  upsertSubscription,
} from "@/server/billing/repo";
import { mapDodoEventToUpdate, type DodoWebhookEvent } from "@/server/billing/dodo-events";
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

  // Idempotency with separate "received" vs "applied" tracking.
  // - First receipt: insert succeeds, `appliedAt` is null, we try to apply.
  // - Duplicate where prior apply succeeded: short-circuit 200, do nothing.
  // - Duplicate where prior apply failed (transient DB error etc): we re-attempt
  //   the apply so the operator doesn't have to dig in manually.
  const recordResult = await recordBillingEvent({
    webhookId,
    eventType,
    dodoSubscriptionId,
    userId,
    payload: event,
  });
  if (recordResult.alreadyApplied) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // No user → can't apply. Record-only and 200 (Dodo would otherwise
  // retry forever). The admin panel surfaces unmapped events.
  if (!userId) {
    log.warn("dodo webhook: no user resolved", { eventType, dodoSubscriptionId });
    return NextResponse.json({ ok: true, unmapped: true });
  }

  const update = mapDodoEventToUpdate(event);
  if (!update) {
    // Unknown event type — record it (already done) and log at info
    // so an operator browsing logs notices unrecognised events.
    log.info("dodo webhook: unrecognised event type", {
      eventType,
      dodoSubscriptionId,
    });
    // Mark applied so we don't retry a no-op forever.
    await markBillingEventApplied(webhookId);
    return NextResponse.json({ ok: true, unrecognised: true });
  }

  try {
    await upsertSubscription({
      userId,
      ...update,
    });
    await markBillingEventApplied(webhookId);
  } catch (e) {
    log.error("dodo webhook: apply failed", {
      userId,
      eventType,
      err: (e as Error).message,
    });
    // Return 5xx so Dodo retries with exponential backoff. Next
    // attempt will find applied_at is still null and re-run apply.
    return NextResponse.json(
      { category: "server", message: "Apply failed; retry expected." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
