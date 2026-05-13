import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, type AuditRow } from "@/server/schema/audit";

/**
 * Fetch the most recent audit-log rows for one (user, connection) pair.
 *
 * The query is fully scoped to the caller's userId, so a leaked or guessed
 * `connectionId` cannot reveal another tenant's writes — the row simply
 * won't match. This is the second line of defence; the route handler is
 * the first (it verifies `getConnectionForUser` before calling here).
 */
export async function fetchRecentAudit(
  userId: string,
  connectionId: string,
  limit: number,
): Promise<AuditRow[]> {
  const clamped = Math.min(Math.max(Math.trunc(limit) || 10, 1), 25);
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.userId, userId), eq(auditLog.connectionId, connectionId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(clamped);
}
