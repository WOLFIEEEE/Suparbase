import "server-only";
import { Resend } from "resend";

/**
 * Singleton Resend client. We lazy-instantiate so the SDK isn't loaded
 * in builds where no email is needed, and so we can re-check the env
 * each request (useful in dev / Coolify when toggling the key).
 *
 * Configuration:
 *   RESEND_API_KEY  , required. Get one at https://resend.com/api-keys
 *   EMAIL_FROM      , required. Must be a verified sender, e.g.
 *                      "Suparbase <invites@yourdomain.com>"
 *   EMAIL_REPLY_TO  , optional. Where replies are routed.
 *
 * `isEmailConfigured()` returns false when the key/from address is
 * missing, so calling code can fall back gracefully.
 */

let cached: Resend | null = null;
let cachedKey: string | null = null;

export interface EmailConfig {
  configured: boolean;
  from: string | null;
  replyTo: string | null;
  /** Why the email pipeline is disabled, if it is. */
  reason?: "no_key" | "no_from";
}

export function getEmailConfig(): EmailConfig {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || null;

  if (!key) return { configured: false, from: null, replyTo, reason: "no_key" };
  if (!from) return { configured: false, from: null, replyTo, reason: "no_from" };
  return { configured: true, from, replyTo };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig().configured;
}

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (cached && cachedKey === key) return cached;
  cached = new Resend(key);
  cachedKey = key;
  return cached;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Render-ready HTML. */
  html: string;
  /** Optional plain-text fallback. Recommended for deliverability. */
  text?: string;
  /** Optional reply-to override. Falls back to EMAIL_REPLY_TO env. */
  replyTo?: string;
  /** Optional headers (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
  /** Optional opaque tag for Resend dashboard filtering. */
  tag?: string;
}

export interface SendEmailResult {
  /** Resend message id (when configured). */
  id: string | null;
  /** Whether the email was actually dispatched. */
  delivered: boolean;
  /** When `delivered=false`, why. */
  reason?: "no_key" | "no_from" | "failed";
  error?: string;
}

/**
 * Send a transactional email through Resend. Returns a tagged result
 * instead of throwing so callers can handle the "not configured" path
 * inline (e.g. fall back to copy-link invitations).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config.configured || !config.from) {
    return { id: null, delivered: false, reason: config.reason ?? "no_key" };
  }
  const client = getClient();
  if (!client) {
    return { id: null, delivered: false, reason: "no_key" };
  }

  try {
    const res = await client.emails.send({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo ?? config.replyTo ?? undefined,
      headers: input.headers,
      tags: input.tag ? [{ name: "category", value: input.tag }] : undefined,
    });
    if (res.error) {
      return {
        id: null,
        delivered: false,
        reason: "failed",
        error: res.error.message ?? "Resend rejected the request.",
      };
    }
    return { id: res.data?.id ?? null, delivered: true };
  } catch (e) {
    return {
      id: null,
      delivered: false,
      reason: "failed",
      error: (e as Error).message ?? "Unknown email error.",
    };
  }
}
