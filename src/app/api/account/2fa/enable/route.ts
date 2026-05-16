import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { enable2FA, MFA_COOKIE_NAME, signMfaCookie } from "@/server/auth/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** The base32 secret returned by /setup. */
  secret: z.string().min(16).max(64),
  /** The 6-digit code the user produced from their authenticator. */
  code: z.string().min(6).max(8),
});

/**
 * POST /api/account/2fa/enable
 *
 * Validates the user's typed code against the proposed secret, then
 * persists the encrypted secret + 10 fresh recovery codes. Returns
 * the recovery codes — these are the only time they're sent in
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
  cookieStore.set(MFA_COOKIE_NAME, signMfaCookie(session.user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60, // 24h
  });

  return NextResponse.json({ ok: true, recoveryCodes: result.recoveryCodes });
}
