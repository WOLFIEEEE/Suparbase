import { NextResponse, type NextRequest } from "next/server";
import { DodoError, readDodoConfig, verifyWebhookSignature } from "@/server/billing/dodo";
import {
  findUserForDodoSubscription,
  markBillingEventApplied,
  recordBillingEvent,
  upsertSubscription,
} from "@/server/billing/repo";
import {
  mapDodoEventToNotification,
  mapDodoEventToUpdate,
  type DodoWebhookEvent,
} from "@/server/billing/dodo-events";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { isEmailConfigured, sendEmail } from "@/server/email/resend";
import { renderBillingNotificationEmail } from "@/server/email/templates/billing-notification";
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

  // Notification-only events (payment.failed, payment.refunded,
  // subscription.trial_ending). They don't mutate subscriptions
  // because a follow-up state event (or no event at all, for
  // trial_ending) is the source of truth. We send the user an email
  // so they know what happened, then mark applied so Dodo doesn't
  // keep retrying.
  const notification = mapDodoEventToNotification(eventType);
  if (notification) {
    await dispatchBillingNotification(userId, notification, event);
    await markBillingEventApplied(webhookId);
    return NextResponse.json({ ok: true, notified: notification });
  }

  const update = mapDodoEventToUpdate(event);
  if (!update) {
    // Unknown event type - record it (already done) and log at info
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

/**
 * Best-effort notification email. Looks up the user's email, renders
 * the appropriate template, sends. Failure (no email configured,
 * Resend rejection, user deleted between webhook arrival and lookup)
 * is logged but never throws - the webhook itself stays successful
 * so Dodo doesn't enter retry hell over a transient email outage.
 */
async function dispatchBillingNotification(
  userId: string,
  kind: ReturnType<typeof mapDodoEventToNotification>,
  event: DodoWebhookEvent,
): Promise<void> {
  if (!kind) return;
  if (!isEmailConfigured()) {
    log.info("dodo webhook: notification skipped (email not configured)", {
      userId,
      kind,
    });
    return;
  }
  try {
    const userRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const email = userRows[0]?.email;
    if (!email) {
      log.warn("dodo webhook: user not found for notification", { userId, kind });
      return;
    }
    const rendered = renderBillingNotificationEmail({
      kind,
      recipientEmail: email,
      trialEndsAt: event.data?.trial_end ?? null,
    });
    const result = await sendEmail({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tag: `billing-${kind}`,
    });
    if (!result.delivered) {
      log.warn("dodo webhook: notification send failed", {
        userId,
        kind,
        reason: result.reason,
        error: result.error,
      });
    }
  } catch (e) {
    log.error("dodo webhook: notification exception", {
      userId,
      kind,
      err: (e as Error).message,
    });
  }
}
