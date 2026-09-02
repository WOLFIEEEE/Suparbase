import "server-only";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { connections, type ConnectionRow } from "@/server/schema/connections";

/**
 * Connections whose scheduled Sentry cadence has elapsed. Ordered oldest-
 * first so a slow cron tick still makes progress on the most overdue.
 */
export async function listDueSentryConnections(limit = 50): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(connections)
    .where(
      and(
        gt(connections.sentryScanIntervalHours, 0),
        or(
          isNull(connections.sentryLastAutoScanAt),
          sql`${connections.sentryLastAutoScanAt} < now() - make_interval(hours => ${connections.sentryScanIntervalHours})`,
        ),
      ),
    )
    .orderBy(asc(connections.sentryLastAutoScanAt))
    .limit(limit);
}

export async function markAutoScan(connectionId: string): Promise<void> {
  await db
    .update(connections)
    .set({ sentryLastAutoScanAt: new Date() })
    .where(eq(connections.id, connectionId));
}
