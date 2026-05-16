import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { confirmVerifyToken } from "@/server/auth/email-verification";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({ token: z.string().min(20).max(120) });

/**
 * POST /api/account/verify-email/confirm
 *
 * Consumes a verification token. 200 on success, 410 expired,
 * 409 already verified, 404 unknown.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = checkSignupRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many attempts. Wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
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
      { category: "validation", message: "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const result = await confirmVerifyToken(parsed.data.token);
    if (result.ok) {
      return NextResponse.json({ ok: true, email: result.email });
    }
    if (result.reason === "expired") {
      return NextResponse.json(
        { category: "expired", message: "Verification link expired. Request a new one." },
        { status: 410 },
      );
    }
    if (result.reason === "already_verified") {
      return NextResponse.json(
        { category: "already_verified", message: "This email is already verified." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { category: "not_found", message: "Verification link is no longer valid." },
      { status: 404 },
    );
  } catch (e) {
    log.error("verify-email/confirm: unexpected", { err: (e as Error).message });
    return NextResponse.json(
      { category: "server", message: "Could not verify." },
      { status: 500 },
    );
  }
}
