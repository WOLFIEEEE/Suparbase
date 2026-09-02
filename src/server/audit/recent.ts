import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, type AuditRow } from "@/server/schema/audit";

/**
 * Fetch the most recent audit-log rows for one connection. The route must
 * authorize workspace access before calling this helper.
 */
export async function fetchRecentAudit(connectionId: string, limit: number): Promise<AuditRow[]> {
  const clamped = Math.min(Math.max(Math.trunc(limit) || 10, 1), 25);
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.connectionId, connectionId))
    .orderBy(desc(auditLog.createdAt))
    .limit(clamped);
}
