import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";
import { getConnectionForUser } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const tableName = url.searchParams.get("table") ?? "";
  const pkRaw = url.searchParams.get("pk") ?? "";
  if (!tableName || !pkRaw) {
    return NextResponse.json(
      { category: "validation", message: "Missing table or pk." },
      { status: 400 },
    );
  }

  let pk: Record<string, unknown>;
  try {
    pk = JSON.parse(pkRaw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ category: "validation", message: "Invalid pk JSON." }, { status: 400 });
  }
  if (typeof pk !== "object" || !pk || Array.isArray(pk)) {
    return NextResponse.json({ category: "validation", message: "pk must be an object." }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, session.user.id),
        eq(auditLog.connectionId, id),
        eq(auditLog.tableName, tableName),
        // jsonb @> jsonb — narrow to rows whose stored PK matches the requested PK.
        sql`${auditLog.primaryKey} @> ${JSON.stringify(pk)}::jsonb`,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      verb: r.verb,
      createdAt: r.createdAt.toISOString(),
      httpStatus: r.httpStatus,
      beforeRow: r.beforeRow,
      afterRow: r.afterRow,
    })),
  });
}
