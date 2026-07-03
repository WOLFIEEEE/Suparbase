import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Saved SQL snippets for the playground (v3.16). Per-user, per-connection
 * named queries so recurring investigations ("orphaned orders", "MAU by
 * week") are one click instead of a paste from a notes app. The SQL text
 * is stored verbatim; execution still goes through the playground's
 * read-only-by-default gate, so saving a destructive statement grants
 * nothing by itself.
 */
export const sqlSnippets = pgTable(
  "sql_snippet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sql: text("sql").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnIdx: index("sql_snippet_per_conn_idx").on(t.userId, t.connectionId, t.updatedAt),
    // Saving under an existing name overwrites it (upsert target).
    uniqueName: uniqueIndex("sql_snippet_unique_name_idx").on(t.userId, t.connectionId, t.name),
  }),
);

export type SqlSnippetRow = typeof sqlSnippets.$inferSelect;
