import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { generate2FASetup } from "@/server/auth/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/account/2fa/setup
 *
 * Returns a fresh TOTP secret + otpauth URL + QR data URL for the
 * signed-in user to scan. Does NOT persist anything - the secret
 * is committed via `/api/account/2fa/enable` after the user proves
 * they can produce a valid code.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const setup = await generate2FASetup(session.user.email);
  return NextResponse.json({
    secret: setup.secret,
    otpauthUrl: setup.otpauthUrl,
    qrSvgDataUrl: setup.qrSvgDataUrl,
  });
}
