import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { buildUserExport } from "@/server/auth/data-export";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/account/export
 *
 * GDPR Art. 15 / Art. 20 data portability endpoint. Returns the
 * signed-in user's full dataset as a single JSON document with a
 * `Content-Disposition: attachment` header so the browser
 * downloads it instead of rendering.
 *
 * Audit log is capped at 100k rows (most recent first). Customers
 * who need more should email support.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await buildUserExport(session.user.id);
  } catch (e) {
    log.error("data export failed", {
      userId: session.user.id,
      err: (e as Error).message,
    });
    return NextResponse.json(
      { category: "server", message: "Export failed. Email contact@suparbase.com." },
      { status: 500 },
    );
  }

  const filename = `suparbase-data-${session.user.email ?? session.user.id}-${
    new Date().toISOString().slice(0, 10)
  }.json`;

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9@._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
