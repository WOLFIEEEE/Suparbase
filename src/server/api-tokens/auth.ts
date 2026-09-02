import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { checkReadRate } from "@/server/proxy/ratelimit";
import { authenticateToken, type AuthenticatedToken } from "./repo";
import { parseBearer } from "./token";

/**
 * Bearer-token gate for /api/public/v1. Returns the token's principal or a
 * ready-to-send 401 / 429. Tokens are read-only, so every public route is a
 * GET or a read-only SQL run; rate limiting is per token, not per user, so
 * one leaked script can't exhaust the owner's interactive budget.
 */
export async function requireApiToken(
  req: NextRequest,
): Promise<{ principal: AuthenticatedToken } | { response: NextResponse }> {
  const plaintext = parseBearer(req.headers.get("authorization"));
  if (!plaintext) {
    return {
      response: NextResponse.json(
        { category: "unauthorized", message: "Send `Authorization: Bearer sbp_…` with a personal API token." },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="suparbase"' } },
      ),
    };
  }
  const principal = await authenticateToken(plaintext);
  if (!principal) {
    return {
      response: NextResponse.json(
        { category: "unauthorized", message: "Token is unknown, revoked, or expired." },
        { status: 401 },
      ),
    };
  }
  const rate = checkReadRate(`token:${principal.tokenId}`);
  if (!rate.allowed) {
    return {
      response: NextResponse.json(
        { category: "rate_limited", message: "Too many requests for this token." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      ),
    };
  }
  return { principal };
}
