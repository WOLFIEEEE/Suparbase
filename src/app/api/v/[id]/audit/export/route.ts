import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema";
import { getConnectionForRole } from "@/server/connections/repo";
import { checkBulkRate } from "@/server/proxy/ratelimit";
import { csvHeaderLine, csvLineFromValues } from "@/lib/csv/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const EXPORT_MAX_ROWS = 10_000;
const BATCH = 1_000;

const COLUMNS = [
  "id",
  "verb",
  "schema",
  "table",
  "primary_key",
  "http_status",
  "session_id",
  "before_row",
  "after_row",
  "created_at",
];

/**
 * GET /api/v/[id]/audit/export — the connection's audit log as CSV,
 * newest first, capped at 10k rows and streamed in 1k batches so a big
 * export never materializes in one server-side buffer.
 */
export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  // Bulk bucket: an export scans up to 10k rows, so it shares the limiter
  // with the other heavyweight operations rather than plain reads.
  const rate = checkBulkRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many exports. Wait and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvHeaderLine(COLUMNS)));
        let offset = 0;
        while (offset < EXPORT_MAX_ROWS) {
          const rows = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.connectionId, id))
            .orderBy(desc(auditLog.createdAt))
            .limit(Math.min(BATCH, EXPORT_MAX_ROWS - offset))
            .offset(offset);
          for (const r of rows) {
            controller.enqueue(
              encoder.encode(
                csvLineFromValues([
                  r.id,
                  r.verb,
                  r.schemaName,
                  r.tableName,
                  r.primaryKey,
                  r.httpStatus,
                  r.sessionId,
                  r.beforeRow,
                  r.afterRow,
                  r.createdAt,
                ]),
              ),
            );
          }
          if (rows.length < BATCH) break;
          offset += rows.length;
        }
      } finally {
        controller.close();
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suparbase-audit-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
