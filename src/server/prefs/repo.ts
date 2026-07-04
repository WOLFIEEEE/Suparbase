import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { pinnedTables, recentRecords } from "@/server/schema";
import type { PinnedTableRow, RecentRecordRow } from "@/server/schema/workspace-prefs";

const MAX_RECENTS = 20;

// ── Pins ───────────────────────────────────────────────────────────────

export async function listPins(userId: string, connectionId: string): Promise<string[]> {
  const rows = await db
    .select({ tableName: pinnedTables.tableName })
    .from(pinnedTables)
    .where(and(eq(pinnedTables.userId, userId), eq(pinnedTables.connectionId, connectionId)))
    .orderBy(desc(pinnedTables.createdAt));
  return rows.map((r) => r.tableName);
}

/** Toggle a pin; returns the new pinned state (true = now pinned). */
export async function togglePin(
  userId: string,
  connectionId: string,
  tableName: string,
): Promise<boolean> {
  const deleted = await db
    .delete(pinnedTables)
    .where(
      and(
        eq(pinnedTables.userId, userId),
        eq(pinnedTables.connectionId, connectionId),
        eq(pinnedTables.tableName, tableName),
      ),
    )
    .returning({ tableName: pinnedTables.tableName });
  if (deleted.length > 0) return false;
  await db
    .insert(pinnedTables)
    .values({ userId, connectionId, tableName })
    .onConflictDoNothing();
  return true;
}

// ── Recents ────────────────────────────────────────────────────────────

export async function listRecents(
  userId: string,
  connectionId: string,
): Promise<Array<Pick<RecentRecordRow, "tableName" | "primaryKey" | "label" | "viewedAt">>> {
  const rows = await db
    .select({
      tableName: recentRecords.tableName,
      primaryKey: recentRecords.primaryKey,
      label: recentRecords.label,
      viewedAt: recentRecords.viewedAt,
    })
    .from(recentRecords)
    .where(and(eq(recentRecords.userId, userId), eq(recentRecords.connectionId, connectionId)))
    .orderBy(desc(recentRecords.viewedAt))
    .limit(MAX_RECENTS);
  return rows;
}

export async function recordRecent(input: {
  userId: string;
  connectionId: string;
  tableName: string;
  primaryKey: Record<string, unknown>;
  label: string;
}): Promise<void> {
  await db
    .insert(recentRecords)
    .values({
      userId: input.userId,
      connectionId: input.connectionId,
      tableName: input.tableName,
      primaryKey: input.primaryKey,
      label: input.label.slice(0, 200),
    })
    .onConflictDoUpdate({
      target: [
        recentRecords.userId,
        recentRecords.connectionId,
        recentRecords.tableName,
        recentRecords.primaryKey,
      ],
      set: { viewedAt: new Date(), label: input.label.slice(0, 200) },
    });

  // Prune anything past the newest MAX_RECENTS for this (user, connection).
  await db.execute(sql`
    DELETE FROM ${recentRecords}
    WHERE ${recentRecords.userId} = ${input.userId}
      AND ${recentRecords.connectionId} = ${input.connectionId}
      AND ${recentRecords.id} NOT IN (
        SELECT id FROM ${recentRecords}
        WHERE ${recentRecords.userId} = ${input.userId}
          AND ${recentRecords.connectionId} = ${input.connectionId}
        ORDER BY ${recentRecords.viewedAt} DESC
        LIMIT ${MAX_RECENTS}
      )
  `);
}

export type { PinnedTableRow };
