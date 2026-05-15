import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getEmailConfig } from "@/server/email/resend";

export const dynamic = "force-dynamic";

/**
 * Lightweight status endpoint the UI hits once when it opens an
 * invitation flow, so we can show the right copy ("we'll email them"
 * vs "copy this link").
 *
 * We require auth so randoms can't probe whether Resend is wired up;
 * we don't return any secrets, just `configured` + `reason`.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const cfg = getEmailConfig();
  return NextResponse.json({
    configured: cfg.configured,
    reason: cfg.reason ?? null,
    // `from` echo is purely cosmetic so the owner can see which sender
    // their invite is coming from in the invite dialog.
    from: cfg.from,
  });
}
