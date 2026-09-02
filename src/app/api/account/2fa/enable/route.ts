import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { verifyPassword } from "@/server/auth/passwords";
import { enable2FA, MFA_COOKIE_NAME, signMfaCookie } from "@/server/auth/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** The base32 secret returned by /setup. */
  secret: z.string().min(16).max(64),
  /** The 6-digit code the user produced from their authenticator. */
  code: z.string().min(6).max(8),
  /** Credentials users must re-enter their current password. */
  password: z.string().max(200).optional(),
});

/**
 * POST /api/account/2fa/enable
 *
 * Validates the user's typed code against the proposed secret, then
 * persists the encrypted secret + 10 fresh recovery codes. Returns
 * the recovery codes - these are the only time they're sent in
 * plaintext. The client MUST show them to the user once and offer
 * a download.
 *
 * Also sets the mfa-ok cookie so the user doesn't get bounced back
 * to /signin/2fa immediately after enabling.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { category: "validation", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        category: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
      },
      { status: 400 },
    );
  }

  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  if (account.passwordHash) {
    const passwordOk = await verifyPassword(parsed.data.password ?? "", account.passwordHash);
    if (!passwordOk) {
      return NextResponse.json(
        { category: "bad_password", message: "Enter your current password to enable 2FA." },
        { status: 400 },
      );
    }
  } else if (Date.now() - (session.user.authAt ?? 0) > 10 * 60_000) {
    return NextResponse.json(
      {
        category: "reauth_required",
        message: "Sign out and sign back in with GitHub before enabling 2FA.",
      },
      { status: 403 },
    );
  }

  const result = await enable2FA(session.user.id, parsed.data.secret, parsed.data.code);
  if (!result.ok) {
    return NextResponse.json(
      {
        category: "bad_code",
        message: "That code didn't match. Try the current one from your authenticator.",
      },
      { status: 400 },
    );
  }

  // Mint the MFA cookie so the user isn't immediately bounced.
  const cookieStore = await cookies();
  cookieStore.set(MFA_COOKIE_NAME, signMfaCookie(session.user.id, session.user.authAt ?? 0), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60, // 24h
  });

  return NextResponse.json({ ok: true, recoveryCodes: result.recoveryCodes });
}
