import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { scanProjectAnon } from "@/server/tools/anon-scan";
import { checkScanRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Public, no-login Supabase Security Scanner. Stateless: it runs the
 * anon-probe against a hosted Supabase project and returns findings —
 * nothing is stored. Rate-limited per IP because each scan fans out to
 * many outbound fetches. SSRF is closed by restricting the target to
 * `*.supabase.co` / `*.supabase.in` inside `scanProjectAnon`.
 */
const BodySchema = z.object({
  url: z.string().trim().min(1).max(200),
  // The anon key is public by design; optional because a mis-configured
  // project may not even need it to leak. Defaults to empty.
  anonKey: z.string().trim().max(4000).optional().default(""),
  // Explicit ownership acknowledgement (anti mass-scanner).
  owns: z.literal(true),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = checkScanRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, category: "rate_limited", message: "Too many scans from your network. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message =
      first?.path?.[0] === "owns"
        ? "Confirm you own this project before scanning."
        : first?.message ?? "Invalid input.";
    return NextResponse.json({ ok: false, category: "validation", message }, { status: 400 });
  }

  const result = await scanProjectAnon(parsed.data.url, parsed.data.anonKey);
  // Never persist url/key/result. Success and handled errors both return 200
  // so the client can render the message uniformly.
  return NextResponse.json(result);
}
