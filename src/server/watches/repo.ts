import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { dataWatches } from "@/server/schema";
import type { DataWatchRow } from "@/server/schema/data-watches";

export interface CreateWatchInput {
  userId: string;
  connectionId: string;
  name: string;
  sql: string;
  webhookUrl: string | null;
  intervalMinutes: number;
}

export async function createWatch(input: CreateWatchInput): Promise<DataWatchRow> {
  const [row] = await db.insert(dataWatches).values(input).returning();
  return row!;
}

export async function listWatches(
  userId: string,
  connectionId: string,
): Promise<DataWatchRow[]> {
  return db
    .select()
    .from(dataWatches)
    .where(and(eq(dataWatches.userId, userId), eq(dataWatches.connectionId, connectionId)))
    .orderBy(desc(dataWatches.createdAt));
}

export async function deleteWatch(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(dataWatches)
    .where(and(eq(dataWatches.id, id), eq(dataWatches.userId, userId)))
    .returning({ id: dataWatches.id });
  return rows.length > 0;
}

export async function setWatchEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(dataWatches)
    .set({ enabled })
    .where(and(eq(dataWatches.id, id), eq(dataWatches.userId, userId)))
    .returning({ id: dataWatches.id });
  return rows.length > 0;
}

/** Enabled watches whose interval has elapsed since their last check. */
export async function listDueWatches(): Promise<DataWatchRow[]> {
  return db
    .select()
    .from(dataWatches)
    .where(
      and(
        eq(dataWatches.enabled, true),
        or(
          isNull(dataWatches.lastCheckedAt),
          sql`${dataWatches.lastCheckedAt} < now() - make_interval(mins => ${dataWatches.intervalMinutes})`,
        ),
      ),
    )
    .orderBy(asc(dataWatches.lastCheckedAt));
}

export async function recordWatchCheck(
  id: string,
  matchCount: number,
  alerted: boolean,
  error: string | null,
): Promise<void> {
  await db
    .update(dataWatches)
    .set({
      lastCheckedAt: new Date(),
      lastMatchCount: matchCount,
      lastAlertedAt: alerted ? new Date() : undefined,
      lastError: error,
    })
    .where(eq(dataWatches.id, id));
}
