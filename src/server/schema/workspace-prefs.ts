import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Per-user, per-connection pinned tables (v3.17). Pinned tables float to the
 * top of the sidebar's table list. Just a bookmark — carries no access,
 * cascades away with the user or the connection.
 */
export const pinnedTables = pgTable(
  "pinned_table",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** Qualified table name, e.g. "public.orders". */
    tableName: text("table_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.connectionId, t.tableName] }),
    perConnIdx: index("pinned_table_per_conn_idx").on(t.userId, t.connectionId),
  }),
);

export type PinnedTableRow = typeof pinnedTables.$inferSelect;

/**
 * Recently-viewed rows (v3.17). A capped MRU list per user + connection so a
 * user can jump back to records they were just looking at. Upserted on row
 * detail view; the API prunes to the newest N.
 */
export const recentRecords = pgTable(
  "recent_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    tableName: text("table_name").notNull(),
    /** Primary key as {col: value} — same shape audit_log stores. */
    primaryKey: jsonb("primary_key").$type<Record<string, unknown>>().notNull(),
    /** Human label for the row (a title-ish column value, or the pk). */
    label: text("label").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // MRU list read: WHERE user+conn ORDER BY viewed_at DESC.
    perConnRecent: index("recent_record_per_conn_recent_idx").on(
      t.userId,
      t.connectionId,
      t.viewedAt,
    ),
    // Re-viewing the same row bumps its timestamp instead of duplicating.
    uniqueRow: uniqueIndex("recent_record_unique_idx").on(
      t.userId,
      t.connectionId,
      t.tableName,
      t.primaryKey,
    ),
  }),
);

export type RecentRecordRow = typeof recentRecords.$inferSelect;
