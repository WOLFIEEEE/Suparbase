import { NextResponse, type NextRequest } from "next/server";
import { DodoError, verifyWebhookSignature } from "@/server/billing/dodo";
import { suppressEmail } from "@/server/email/suppression";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/webhooks/resend
 *
 * Resend webhooks (Svix-signed, Standard Webhooks spec - identical
 * crypto to Dodo's so we reuse `verifyWebhookSignature`). The headers
 * are namespaced under `svix-*` rather than `webhook-*`, but the
 * signed payload format is the same: `${id}.${timestamp}.${body}`.
 *
 * Events we care about:
 *
 *   - `email.bounced` (hard bounce): the address doesn't exist or
 *     the mailbox rejected permanently. Suppress the user so we
 *     stop trying.
 *   - `email.complained` (spam complaint): the recipient clicked
 *     "Report spam". Aggressive suppression - we never email this
 *     address again until manual review clears it.
 *   - `email.delivered` / `email.opened` etc.: ignored. We don't
 *     track opens or build delivery dashboards (yet).
 *
 * Authenticity: Svix signing with `RESEND_WEBHOOK_SECRET`. Set this
 * env var to the value Resend gives you when you create the webhook
 * in their dashboard. Missing config = 503 (fail closed - we'd
 * rather have Resend retry than ingest forged events).
 *
 * Exempt from CSRF middleware (webhooks have no Origin header;
 * authenticity comes from the HMAC signature instead).
 */

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    bounce?: { type?: string };
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    log.warn("resend webhook: not configured");
    return NextResponse.json({ category: "not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  try {
    verifyWebhookSignature({
      secret,
      rawBody,
      webhookId: svixId,
      webhookTimestamp: svixTimestamp,
      webhookSignature: svixSignature,
    });
  } catch (e) {
    if (e instanceof DodoError) {
      log.warn("resend webhook: signature rejected", {
        category: e.category,
        svixId,
      });
      return NextResponse.json({ category: e.category }, { status: 400 });
    }
    log.error("resend webhook: signature unexpected", {
      err: (e as Error).message,
    });
    return NextResponse.json({ category: "server" }, { status: 500 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    log.warn("resend webhook: non-JSON body");
    return NextResponse.json({ category: "validation" }, { status: 400 });
  }

  const eventType = event.type ?? "unknown";
  const data = event.data ?? {};
  const recipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];

  switch (eventType) {
    case "email.bounced": {
      // Soft bounces (`transient`) come back as `bounce.type='soft'`.
      // We only suppress on hard bounces; soft can be retried by Resend.
      const bounceType = data.bounce?.type ?? "hard";
      if (bounceType === "soft") {
        log.info("resend webhook: soft bounce (no suppression)", {
          recipients,
        });
        return NextResponse.json({ ok: true, bounceType });
      }
      let suppressed = 0;
      for (const r of recipients) {
        const result = await suppressEmail(r, "hard_bounce");
        suppressed += result.matched;
      }
      log.warn("resend webhook: hard bounce suppressed", {
        recipients,
        suppressed,
      });
      return NextResponse.json({ ok: true, suppressed });
    }
    case "email.complained": {
      let suppressed = 0;
      for (const r of recipients) {
        const result = await suppressEmail(r, "spam_complaint");
        suppressed += result.matched;
      }
      log.warn("resend webhook: spam complaint suppressed", {
        recipients,
        suppressed,
      });
      return NextResponse.json({ ok: true, suppressed });
    }
    default:
      // Acknowledge so Resend doesn't retry, but we don't act on it.
      return NextResponse.json({ ok: true, ignored: eventType });
  }
}
