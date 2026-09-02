import "server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";
import { agentSessions } from "@/server/schema/agent-sessions";

export interface ActivityEntry {
  id: string;
  verb: "insert" | "update" | "delete";
  schemaName: string | null;
  tableName: string | null;
  primaryKey: Record<string, unknown>;
  httpStatus: number | null;
  createdAt: string;
  sessionId: string | null;
  sessionLabel: string | null;
  sessionKind: string | null;
}

export interface ActivityFilter {
  verb?: "insert" | "update" | "delete";
  table?: string;
  /** Keyset pagination: only rows strictly older than this ISO timestamp. */
  before?: string;
  limit?: number;
}

/**
 * Connection-level activity timeline from audit_log, newest first, with the
 * agent-session label joined in so each write is attributable. Scoped to the
 * caller's userId as a second line of defence (route verifies access first).
 * Keyset-paginated on createdAt for stable "load more".
 */
export async function fetchActivity(
  connectionId: string,
  filter: ActivityFilter = {},
): Promise<ActivityEntry[]> {
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50) || 50, 1), 200);
  const conds = [eq(auditLog.connectionId, connectionId)];
  if (filter.verb) conds.push(eq(auditLog.verb, filter.verb));
  if (filter.table) conds.push(eq(auditLog.tableName, filter.table));
  if (filter.before) {
    const d = new Date(filter.before);
    if (!Number.isNaN(d.getTime())) conds.push(lt(auditLog.createdAt, d));
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conds))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  // Resolve session labels in one round-trip.
  const sessionIds = [...new Set(rows.map((r) => r.sessionId).filter((s): s is string => !!s))];
  const labels = new Map<string, { label: string; kind: string }>();
  if (sessionIds.length > 0) {
    const sessions = await db
      .select({ id: agentSessions.id, label: agentSessions.label, kind: agentSessions.kind })
      .from(agentSessions)
      .where(inArray(agentSessions.id, sessionIds));
    for (const s of sessions) labels.set(s.id, { label: s.label, kind: s.kind });
  }

  return rows.map((r) => {
    const s = r.sessionId ? labels.get(r.sessionId) : undefined;
    return {
      id: r.id,
      verb: r.verb,
      schemaName: r.schemaName,
      tableName: r.tableName,
      primaryKey: r.primaryKey ?? {},
      httpStatus: r.httpStatus,
      createdAt: r.createdAt.toISOString(),
      sessionId: r.sessionId,
      sessionLabel: s?.label ?? null,
      sessionKind: s?.kind ?? null,
    };
  });
}
