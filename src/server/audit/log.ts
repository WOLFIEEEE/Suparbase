import "server-only";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";
import { log } from "@/server/log";

export interface AuditInput {
  userId: string;
  connectionId: string;
  schemaName: string;
  tableName: string;
  primaryKey: Record<string, unknown> | null;
  verb: "insert" | "update" | "delete";
  httpStatus: number;
  beforeRow?: Record<string, unknown> | null;
  afterRow?: Record<string, unknown> | null;
  /** Agent session this write belongs to (v3.1+). Null when no session was attached. */
  sessionId?: string | null;
}

/**
 * Persists an audit entry and reports whether it succeeded. Mutation paths
 * await this result so a persistence failure is observable and logged before
 * the response completes.
 */
export async function auditWrite(input: AuditInput): Promise<boolean> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      connectionId: input.connectionId,
      schemaName: input.schemaName,
      tableName: input.tableName,
      primaryKey: input.primaryKey ?? {},
      verb: input.verb,
      httpStatus: input.httpStatus,
      beforeRow: input.beforeRow ?? null,
      afterRow: input.afterRow ?? null,
      sessionId: input.sessionId ?? null,
    });
    return true;
  } catch (error) {
    log.error("audit row persistence failed", {
      connectionId: input.connectionId,
      tableName: input.tableName,
      verb: input.verb,
      err: error,
    });
    return false;
  }
}
