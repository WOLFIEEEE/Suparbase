import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getConnectionForUser } from "@/server/connections/repo";
import { getSession } from "@/server/sentry/sessions";
import { auditLog } from "@/server/schema/audit";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; sessionId: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, sessionId } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const s = await getSession(session.user.id, id, sessionId);
  if (!s) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const writes = await db
    .select({
      id: auditLog.id,
      schemaName: auditLog.schemaName,
      tableName: auditLog.tableName,
      verb: auditLog.verb,
      primaryKey: auditLog.primaryKey,
      beforeRow: auditLog.beforeRow,
      afterRow: auditLog.afterRow,
      httpStatus: auditLog.httpStatus,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, session.user.id),
        eq(auditLog.connectionId, id),
        eq(auditLog.sessionId, sessionId),
      ),
    )
    .orderBy(asc(auditLog.createdAt));

  return NextResponse.json({
    session: s,
    canUndo: !!conn.encryptedPostgresUrl,
    writes: writes.map((w) => ({
      id: w.id,
      schemaName: w.schemaName,
      tableName: w.tableName,
      verb: w.verb,
      primaryKey: w.primaryKey ?? {},
      beforeRow: w.beforeRow ?? null,
      afterRow: w.afterRow ?? null,
      httpStatus: w.httpStatus,
      createdAt: w.createdAt.toISOString(),
    })),
  });
}
