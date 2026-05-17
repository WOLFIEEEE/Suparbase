import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkContactRate } from "@/server/proxy/ratelimit";
import { isEmailConfigured, sendEmail } from "@/server/email/resend";
import { renderContactSubmissionEmail } from "@/server/email/templates/contact-submission";
import { CONTACT_TOPIC_VALUES, type ContactTopic } from "@/lib/contact/topics";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOPIC_VALUES = CONTACT_TOPIC_VALUES as readonly [
  ContactTopic,
  ...ContactTopic[],
];

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254, "Email is too long."),
  topic: z.enum(TOPIC_VALUES),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters.")
    .max(5000, "Message is too long (max 5000 characters)."),
  referrer: z.string().max(2048).optional().nullable(),
  /** Honeypot — bots fill it, humans don't see it. Must be empty. */
  website: z.string().max(0).optional(),
});

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function contactInbox(): string {
  return process.env.CONTACT_INBOX?.trim() || "contact@suparbase.com";
}

export async function POST(req: NextRequest) {
  const ip = clientKey(req);
  const limit = checkContactRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: "Too many submissions from this network. Try again later.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Some fields are invalid.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  // Honeypot tripped — pretend we accepted so bots don't tune their payload.
  if (parsed.data.website && parsed.data.website.length > 0) {
    log.warn("contact: honeypot tripped", { ip });
    return NextResponse.json({ ok: true, delivered: false, reason: "blocked" });
  }

  const { name, email, topic, message, referrer } = parsed.data;
  const topicTyped = topic as ContactTopic;

  if (!isEmailConfigured()) {
    log.warn("contact: email not configured, dropping submission", {
      topic: topicTyped,
      name,
      email,
    });
    return NextResponse.json(
      {
        ok: true,
        delivered: false,
        message:
          "Email delivery isn't configured on this deployment. Reach the operator directly.",
      },
      { status: 200 },
    );
  }

  const rendered = renderContactSubmissionEmail({
    name,
    email,
    topic: topicTyped,
    message,
    referrer: referrer ?? null,
    ip,
  });

  const result = await sendEmail({
    to: contactInbox(),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // Operator clicks Reply → goes straight to the visitor.
    replyTo: email,
    tag: "contact-form",
  });

  if (!result.delivered) {
    log.error("contact: send failed", {
      reason: result.reason,
      error: result.error,
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          "We couldn't deliver your message. Please try again in a few minutes.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, delivered: true });
}
