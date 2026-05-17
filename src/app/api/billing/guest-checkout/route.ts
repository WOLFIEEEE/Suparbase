import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { createCheckout, DodoError, readDodoConfig } from "@/server/billing/dodo";
import { PLAN_LIMITS } from "@/server/billing/plans";
import { getActivePlan } from "@/server/billing/repo";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { issueWelcomeToken } from "@/server/auth/welcome-token";
import { renderWelcomePaymentEmail } from "@/server/email/templates/welcome-payment";
import { isEmailConfigured, sendEmail } from "@/server/email/resend";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/guest-checkout
 *
 * Public endpoint: starts a Dodo checkout for a visitor who hasn't
 * signed up yet. The flow:
 *
 *   1. Validate email + cadence.
 *   2. Rate-limit by IP (reuses the signup bucket; same anti-abuse
 *      profile and same dollar exposure - each Dodo checkout
 *      costs us API calls).
 *   3. Look up the email. If an account with a password already
 *      exists → 409 with a pointer to /signin. If no account, or
 *      an account with no password (OAuth-only or a prior abandoned
 *      guest checkout), continue.
 *   4. Create the user row if missing. Mint a `welcome:<userId>`
 *      token, persist hashed.
 *   5. Mail the welcome link (best-effort - if email isn't
 *      configured, the user can still claim via the Dodo return
 *      URL).
 *   6. Call Dodo to create the checkout, embedding the welcome
 *      token in the `return_url` so the success page can drop the
 *      visitor straight onto /welcome/<token>.
 *
 * Returns `{ checkoutUrl }`. The client navigates there.
 *
 * Idempotent enough: re-submitting with the same email re-issues a
 * new welcome token (old ones are cleared) and creates a fresh Dodo
 * session. Old sessions abandoned in Dodo's UI go cold.
 */

const TOPIC_VALUES = ["hosted"] as const;

const GuestCheckoutSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(254, "Email is too long."),
  plan: z.enum(TOPIC_VALUES).default("hosted"),
  cadence: z.enum(["monthly", "annual"]).default("monthly"),
  /** Optional display name, surfaced into Dodo's customer record. */
  name: z.string().trim().min(1).max(120).optional(),
});

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  // Rate-limit at the IP level. Same bucket as signup because the
  // dollar exposure profile is the same (one Dodo checkout per call).
  const ip = clientKey(req);
  const limit = checkSignupRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        category: "rate_limited",
        message: "Too many checkout attempts from this network. Try again later.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { category: "validation", message: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const parsed = GuestCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        category: "validation",
        message: issue?.message ?? "Some fields are invalid.",
        field: issue?.path[0],
      },
      { status: 400 },
    );
  }
  const { email, plan, cadence, name } = parsed.data;

  const config = readDodoConfig();
  if (!config) {
    return NextResponse.json(
      {
        category: "not_configured",
        message: "Billing isn't configured on this deployment.",
      },
      { status: 503 },
    );
  }

  // Resolve / create the user row. Three cases:
  //   - No row yet → insert one with null passwordHash.
  //   - Row exists with a passwordHash → 409 "please sign in first".
  //     We deliberately don't say "this email is taken" beyond the
  //     fact that they'd recognise an existing account at sign-in.
  //   - Row exists without a passwordHash (OAuth-only, or prior
  //     abandoned guest checkout) → reuse the row.
  const existingRows = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  let userId: string;
  let displayEmail: string;
  if (existingRows.length > 0) {
    const existing = existingRows[0]!;
    if (existing.passwordHash) {
      // Don't let an already-paid user double-subscribe by mistake.
      const active = await getActivePlan(existing.id);
      if (active.isPaid) {
        return NextResponse.json(
          {
            category: "already_subscribed",
            message:
              "An account with this email is already subscribed. Please sign in instead.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          category: "account_exists",
          message:
            "An account with this email already exists. Please sign in to subscribe.",
        },
        { status: 409 },
      );
    }
    userId = existing.id;
    displayEmail = existing.email ?? email;
  } else {
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: name ?? null,
        passwordHash: null,
      })
      .returning({ id: users.id, email: users.email });
    if (!row) {
      log.error("guest-checkout: failed to insert user", { email });
      return NextResponse.json(
        { category: "server", message: "Could not start checkout." },
        { status: 500 },
      );
    }
    userId = row.id;
    displayEmail = row.email ?? email;
  }

  // Mint the welcome token.
  const { token: welcomeToken, expiresAt } = await issueWelcomeToken(userId);

  // Best-effort email of the welcome link, so the user has a way
  // back even if Dodo's redirect fails or they close the tab.
  if (isEmailConfigured()) {
    try {
      const rendered = renderWelcomePaymentEmail({
        token: welcomeToken,
        recipientEmail: displayEmail,
        planLabel: PLAN_LIMITS[plan].label,
        cadenceLabel: cadence === "annual" ? "annual" : "monthly",
        expiresAt,
      });
      const result = await sendEmail({
        to: displayEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tag: "welcome-payment",
      });
      if (!result.delivered) {
        log.warn("guest-checkout: welcome email send failed", {
          userId,
          reason: result.reason,
          error: result.error,
        });
      }
    } catch (e) {
      log.error("guest-checkout: welcome email exception", {
        userId,
        err: (e as Error).message,
      });
    }
  }

  // Build Dodo checkout.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const productId =
    cadence === "annual" && config.hostedAnnualProductId
      ? config.hostedAnnualProductId
      : config.hostedProductId;
  const returnUrl = `${origin}/api/billing/return?status=success&welcome=${encodeURIComponent(
    welcomeToken,
  )}`;
  const cancelUrl = `${origin}/checkout/${plan}?cancelled=1`;

  try {
    const result = await createCheckout({
      config,
      productId,
      trialPeriodDays: PLAN_LIMITS[plan].trialDays,
      customer: { email: displayEmail, name: name ?? displayEmail.split("@")[0]! },
      metadata: { user_id: userId, cadence, signup_path: "guest_checkout" },
      returnUrl,
      cancelUrl,
    });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl, cadence });
  } catch (e) {
    if (e instanceof DodoError) {
      log.warn("guest-checkout: dodo failure", {
        userId,
        category: e.category,
        err: e.message,
      });
      const status =
        e.category === "unauthorized"
          ? 502
          : e.category === "validation"
          ? 422
          : e.category === "network"
          ? 502
          : 500;
      return NextResponse.json(
        {
          category: e.category,
          message:
            e.category === "unauthorized" ? "Billing is misconfigured." : e.message,
        },
        { status },
      );
    }
    log.error("guest-checkout: unexpected", {
      userId,
      err: (e as Error).message,
    });
    return NextResponse.json(
      { category: "server", message: "Could not start checkout." },
      { status: 500 },
    );
  }
}
