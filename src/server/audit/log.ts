import "server-only";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";

export interface AuditInput {
  userId: string;
  connectionId: string;
  schemaName: string;
  tableName: string;
  primaryKey: Record<string, unknown> | null;
  verb: "insert" | "update" | "delete";
  httpStatus: number;
}

/**
 * Fire-and-forget audit write. We do not await this when called from the proxy
 * so a slow audit insert never delays the user-visible response. The caller
 * may still `await` if it wants a guarantee for tests.
 */
export async function auditWrite(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      connectionId: input.connectionId,
      schemaName: input.schemaName,
      tableName: input.tableName,
      primaryKey: input.primaryKey ?? {},
      verb: input.verb,
      httpStatus: input.httpStatus,
    });
  } catch {
    // never let an audit failure surface to the user
  }
}
