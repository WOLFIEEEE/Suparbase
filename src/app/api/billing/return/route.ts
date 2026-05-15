import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/billing/return
 *
 * Dodo redirects the customer here after the hosted checkout
 * succeeds or is cancelled. We don't trust the URL parameters for
 * subscription state (could be forged); the authoritative source is
 * the webhook handler. This route just shuttles the user back to
 * `/settings/billing` with a status flash so the UI can show a
 * success/cancel toast.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "success";
  const safe = status === "cancelled" ? "cancelled" : "success";
  const dest = new URL("/settings/billing", req.url);
  dest.searchParams.set("status", safe);
  return NextResponse.redirect(dest);
}
