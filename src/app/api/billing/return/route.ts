import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/billing/return
 *
 * Dodo redirects the customer here after the hosted checkout
 * succeeds or is cancelled. We don't trust the URL parameters for
 * subscription state (could be forged); the authoritative source is
 * the webhook handler.
 *
 * Two return paths depending on how the checkout was initiated:
 *
 *   - Signed-in customer (POST /api/billing/checkout): send them
 *     back to `/settings/billing` with a status flash so the UI can
 *     show a success/cancel toast.
 *
 *   - Guest customer (POST /api/billing/guest-checkout): the
 *     `welcome` query parameter carries the single-use token they
 *     need to set a password and sign in. Forward them straight to
 *     `/welcome/<token>`. On cancel, drop them back on the public
 *     checkout page so they can try again without losing context.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "success";
  const safe = status === "cancelled" ? "cancelled" : "success";
  const welcomeToken = req.nextUrl.searchParams.get("welcome")?.trim();

  if (welcomeToken && safe === "success") {
    const dest = new URL(
      `/welcome/${encodeURIComponent(welcomeToken)}`,
      req.url,
    );
    return NextResponse.redirect(dest);
  }
  if (welcomeToken && safe === "cancelled") {
    const dest = new URL("/checkout/hosted?cancelled=1", req.url);
    return NextResponse.redirect(dest);
  }

  const dest = new URL("/settings/billing", req.url);
  dest.searchParams.set("status", safe);
  return NextResponse.redirect(dest);
}
