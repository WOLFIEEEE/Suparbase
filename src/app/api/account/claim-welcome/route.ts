import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { hashPassword } from "@/server/auth/passwords";
import { consumeWelcomeToken } from "@/server/auth/welcome-token";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { log } from "@/server/log";

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/claim-welcome
 *
 * Final step of the guest-checkout flow. The visitor lands on
 * `/welcome/<token>` after Dodo redirects, picks a password, and
 * this route:
 *
 *   1. Consumes the single-use welcome token (single-use enforced
 *      by `consumeWelcomeToken`, which also stamps email_verified).
 *   2. Sets the bcrypt password hash on the user row.
 *
 * Returns `{ ok: true, email }` so the client can call
 * `signIn("credentials", { email, password })` next. We deliberately
 * don't sign the user in server-side: NextAuth's Credentials provider
 * is client-driven, and that keeps the cookie handling in one place.
 */

const ClaimSchema = z.object({
  token: z.string().min(1).max(512),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(200, "Password is too long."),
});

export async function POST(req: NextRequest) {
  // Rate-limit by IP. Reuses the signup bucket because the threat
  // model is the same (unauthenticated POST that mutates account
  // state). 5 attempts per hour per IP is more than generous for a
  // legit user who mistyped a password; it slows token enumeration
  // to a crawl.
  const limit = checkSignupRate(clientKey(req));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Too many attempts from this network. Try again in a few minutes.",
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
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        message: issue?.message ?? "Some fields are invalid.",
        field: issue?.path[0],
      },
      { status: 400 },
    );
  }

  const { token, password } = parsed.data;
  const consumed = await consumeWelcomeToken(token);
  if (!consumed.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: consumed.reason,
        message:
          consumed.reason === "expired"
            ? "This invitation has expired. Use forgot-password to set one now."
            : "This invitation isn't valid (it may have been used already). Sign in or use forgot-password.",
      },
      { status: consumed.reason === "expired" ? 410 : 404 },
    );
  }

  const passwordHash = await hashPassword(password);
  try {
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, consumed.userId));
  } catch (e) {
    log.error("claim-welcome: password update failed", {
      userId: consumed.userId,
      err: (e as Error).message,
    });
    return NextResponse.json(
      { ok: false, message: "Could not save your password. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, email: consumed.email });
}
