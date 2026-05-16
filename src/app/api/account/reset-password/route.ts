import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeResetToken } from "@/server/auth/password-reset";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().min(20).max(120),
  // Matches the signup-form rule: at least 12 chars. The form-side
  // strength meter encourages stronger; we just enforce a floor here.
  password: z.string().min(12).max(200),
});

/**
 * POST /api/auth/reset-password
 *
 * Consumes a single-use reset token + sets a new password (bcrypt
 * cost 12). Returns 410 for expired tokens, 409 for already-used,
 * 404 for unknown — distinct codes so the UI can render the right
 * recovery instruction.
 *
 * On success, also revokes any other outstanding tokens for the same
 * user (handled inside consumeResetToken).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = checkSignupRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many attempts. Try again shortly." },
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
      {
        category: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
        field: parsed.error.issues[0]?.path?.[0],
      },
      { status: 400 },
    );
  }

  try {
    const result = await consumeResetToken(parsed.data.token, parsed.data.password);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    if (result.reason === "expired") {
      return NextResponse.json(
        { category: "expired", message: "This reset link has expired. Request a new one." },
        { status: 410 },
      );
    }
    if (result.reason === "consumed") {
      return NextResponse.json(
        { category: "consumed", message: "This link has already been used." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { category: "not_found", message: "This reset link is no longer valid." },
      { status: 404 },
    );
  } catch (e) {
    log.error("reset-password: unexpected", { err: (e as Error).message });
    return NextResponse.json(
      { category: "server", message: "Could not reset password." },
      { status: 500 },
    );
  }
}
