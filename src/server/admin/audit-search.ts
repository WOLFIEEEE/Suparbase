import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, connections, users, type AuditRow } from "@/server/schema";

/**
 * Admin-only audit-log search. Lets an operator answer questions
 * like "what did user X do on Sunday?" or "every write on table Y
 * in the last hour" without resorting to ad-hoc SQL.
 *
 * Restricted to admins by the calling page's `getAdminSession()`
 * gate; this module assumes the caller is authorised.
 *
 * Indexes: `audit_conn_recent_idx (user_id, connection_id,
 * created_at DESC)` covers the typical multi-filter scan;
 * `audit_created_at_idx` covers the global date-range fallback.
 */

export interface AuditSearchParams {
  /** Filter by user id (the caller of the audited request). */
  userId?: string;
  /** Filter by connection id. */
  connectionId?: string;
  /** Filter by schema (default "public"). */
  schemaName?: string;
  /** Filter by table name. */
  tableName?: string;
  /** Filter by verb. */
  verb?: "insert" | "update" | "delete";
  /** Lower bound (inclusive). */
  since?: Date;
  /** Upper bound (inclusive). */
  until?: Date;
  /** Defaults to 200; capped at 1000. */
  limit?: number;
  /** Pagination offset; defaults to 0. */
  offset?: number;
}

export interface AuditSearchRow extends AuditRow {
  userEmail: string | null;
  connectionName: string | null;
}

export async function searchAuditLog(params: AuditSearchParams): Promise<AuditSearchRow[]> {
  const limit = Math.min(params.limit ?? 200, 1000);
  const offset = Math.max(params.offset ?? 0, 0);
  const conditions = [];
  if (params.userId) conditions.push(eq(auditLog.userId, params.userId));
  if (params.connectionId) conditions.push(eq(auditLog.connectionId, params.connectionId));
  if (params.schemaName) conditions.push(eq(auditLog.schemaName, params.schemaName));
  if (params.tableName) conditions.push(eq(auditLog.tableName, params.tableName));
  if (params.verb) conditions.push(eq(auditLog.verb, params.verb));
  if (params.since) conditions.push(gte(auditLog.createdAt, params.since));
  if (params.until) conditions.push(lte(auditLog.createdAt, params.until));

  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = await db
    .select({
      // Spread the full audit row so the type matches AuditRow exactly.
      id: auditLog.id,
      userId: auditLog.userId,
      connectionId: auditLog.connectionId,
      schemaName: auditLog.schemaName,
      tableName: auditLog.tableName,
      primaryKey: auditLog.primaryKey,
      verb: auditLog.verb,
      httpStatus: auditLog.httpStatus,
      beforeRow: auditLog.beforeRow,
      afterRow: auditLog.afterRow,
      sessionId: auditLog.sessionId,
      createdAt: auditLog.createdAt,
      userEmail: users.email,
      connectionName: connections.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .leftJoin(connections, eq(connections.id, auditLog.connectionId))
    .where(where as ReturnType<typeof and>)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

/** Light summary: total rows touched by criteria (for the "X results" header). */
export async function countAuditMatches(params: AuditSearchParams): Promise<number> {
  const conditions = [];
  if (params.userId) conditions.push(eq(auditLog.userId, params.userId));
  if (params.connectionId) conditions.push(eq(auditLog.connectionId, params.connectionId));
  if (params.schemaName) conditions.push(eq(auditLog.schemaName, params.schemaName));
  if (params.tableName) conditions.push(eq(auditLog.tableName, params.tableName));
  if (params.verb) conditions.push(eq(auditLog.verb, params.verb));
  if (params.since) conditions.push(gte(auditLog.createdAt, params.since));
  if (params.until) conditions.push(lte(auditLog.createdAt, params.until));
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where as ReturnType<typeof and>);
  return rows[0]?.c ?? 0;
}
