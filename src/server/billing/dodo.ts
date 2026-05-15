import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { redact } from "@/lib/redact";

/**
 * Dodo Payments REST + webhook helpers.
 *
 * The integration is deliberately tiny — one POST to create a
 * checkout session, one signature-verify helper for incoming webhooks.
 * Everything else flows through the webhook → database, which is
 * Dodo's recommended pattern.
 *
 * Test vs live mode is selected by `DODO_MODE`. Both modes use the
 * same headers and shapes, just different hostnames.
 */

const TEST_BASE = "https://test.dodopayments.com";
const LIVE_BASE = "https://live.dodopayments.com";

const TIMEOUT_MS = 10_000;
/** Reject signatures older than this. Standard Webhooks suggests 5 min. */
const WEBHOOK_REPLAY_TOLERANCE_SECONDS = 5 * 60;

export class DodoError extends Error {
  constructor(
    public readonly category:
      | "config"
      | "network"
      | "unauthorized"
      | "validation"
      | "server"
      | "signature_invalid"
      | "signature_stale",
    message: string,
  ) {
    super(message);
    this.name = "DodoError";
  }
}

export interface DodoConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  hostedProductId: string;
}

/**
 * Read config from env. Returns null when not configured so the app
 * can still boot; callers should surface a friendly "billing not
 * configured" state instead of crashing.
 */
export function readDodoConfig(): DodoConfig | null {
  const apiKey = process.env.DODO_API_KEY;
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
  const hostedProductId =
    process.env.DODO_HOSTED_PRODUCT_ID ?? "pdt_0Nev0FKdzw0UxPeUBKItA";
  if (!apiKey) return null;
  const mode = (process.env.DODO_MODE ?? "test").toLowerCase();
  const baseUrl = mode === "live" ? LIVE_BASE : TEST_BASE;
  return {
    apiKey,
    baseUrl,
    // Webhook secret is only required by the receiver; if it's absent
    // the checkout side still works, but incoming events will be
    // rejected. We track it here so the receiver can fail closed.
    webhookSecret: webhookSecret ?? "",
    hostedProductId,
  };
}

export function isBillingConfigured(): boolean {
  return readDodoConfig() !== null;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CreateCheckoutInput {
  config: DodoConfig;
  productId: string;
  trialPeriodDays?: number;
  customer: { email: string; name?: string };
  metadata?: Record<string, string>;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

/**
 * Create a hosted checkout session for the Hosted plan. Dodo handles
 * the entire payment flow at `checkout_url`; the customer is sent
 * back to `return_url` (success) or `cancel_url` (back-button).
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const body: Record<string, unknown> = {
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    customer: input.customer,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata ?? {},
  };
  if (input.trialPeriodDays && input.trialPeriodDays > 0) {
    body.subscription_data = { trial_period_days: input.trialPeriodDays };
  }
  const res = await dodoFetch(input.config, "POST", "/checkouts", body);
  const data = (await res.json().catch(() => null)) as
    | { session_id?: string; checkout_url?: string }
    | null;
  if (!data?.checkout_url || !data.session_id) {
    throw new DodoError(
      "server",
      `Checkout response missing fields: ${redact(JSON.stringify(data).slice(0, 200))}`,
    );
  }
  return { sessionId: data.session_id, checkoutUrl: data.checkout_url };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Standard Webhooks signature using Dodo's signing key.
 *
 * Spec: the signed payload is `${webhook-id}.${webhook-timestamp}.${raw_body}`,
 * HMAC-SHA256-ed with the secret, then base64-encoded. The signature
 * header carries one or more comma-separated entries prefixed with
 * `v1,` — any one matching means we trust the message.
 *
 * Throws DodoError("signature_stale") when the timestamp is more than
 * 5 minutes old to defend against replay.
 */
export function verifyWebhookSignature(params: {
  secret: string;
  rawBody: string;
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
  now?: () => number;
}): void {
  const { secret, rawBody, webhookId, webhookTimestamp, webhookSignature } = params;
  if (!secret) {
    throw new DodoError("config", "Webhook secret is not configured.");
  }
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new DodoError("signature_invalid", "Missing webhook signature headers.");
  }

  // Replay defence: reject anything more than the tolerance window
  // out of date. Standard Webhooks uses seconds since epoch.
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) {
    throw new DodoError("signature_invalid", "Invalid webhook-timestamp header.");
  }
  const nowMs = (params.now ?? Date.now)();
  const skewSec = Math.abs(Math.floor(nowMs / 1000) - ts);
  if (skewSec > WEBHOOK_REPLAY_TOLERANCE_SECONDS) {
    throw new DodoError(
      "signature_stale",
      `Webhook timestamp is ${skewSec}s out of tolerance.`,
    );
  }

  // Secrets distributed via Standard Webhooks dashboards conventionally
  // arrive with a `whsec_` prefix (base64) — strip it before HMAC.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  // Convention: secrets are base64. If it parses, use the decoded
  // bytes; otherwise treat as raw UTF-8 text.
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(rawSecret, "base64");
    if (secretBytes.length === 0) throw new Error("empty");
  } catch {
    secretBytes = Buffer.from(rawSecret, "utf8");
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // Header format: one or more whitespace-separated `v1,<sig>`
  // entries. Within an entry, the version and signature are
  // comma-separated. Standard Webhooks publishes this exact shape.
  const entries = webhookSignature.split(/\s+/).filter(Boolean);
  const expectedBuf = Buffer.from(expected, "utf8");
  for (const entry of entries) {
    const commaIdx = entry.indexOf(",");
    if (commaIdx <= 0) continue;
    const version = entry.slice(0, commaIdx);
    const sig = entry.slice(commaIdx + 1);
    if (version !== "v1" || !sig) continue;
    const candidate = Buffer.from(sig, "utf8");
    if (candidate.length !== expectedBuf.length) continue;
    if (timingSafeEqual(candidate, expectedBuf)) return;
  }
  throw new DodoError("signature_invalid", "Webhook signature did not match.");
}

// ---------------------------------------------------------------------------
// Low-level fetch with timeout + error mapping
// ---------------------------------------------------------------------------

async function dodoFetch(
  config: DodoConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new DodoError(
      "network",
      `Could not reach Dodo (${(e as Error).message ?? "unknown"}).`,
    );
  }
  clearTimeout(timer);
  if (res.status === 401 || res.status === 403) {
    throw new DodoError("unauthorized", "Dodo rejected the API key.");
  }
  if (res.status === 422 || res.status === 400) {
    const text = await res.text().catch(() => "");
    throw new DodoError(
      "validation",
      `Dodo ${res.status}: ${redact(text.slice(0, 200))}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DodoError(
      "server",
      `Dodo ${res.status}: ${redact(text.slice(0, 200))}`,
    );
  }
  return res;
}
