import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Workspace notes (v3.20). Free-text annotations pinned to a table
 * (`primaryKey` null) or to a single row (`primaryKey` = {col: value},
 * the same shape audit_log and recent_record use). Visible to every
 * member of the connection so context ("this account is a test tenant,
 * don't delete") travels with the data instead of living in Slack.
 */
export const workspaceNotes = pgTable(
  "workspace_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    tableName: text("table_name").notNull(),
    primaryKey: jsonb("primary_key").$type<Record<string, unknown>>(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perTableRecent: index("workspace_note_per_table_idx").on(
      t.connectionId,
      t.tableName,
      t.createdAt.desc(),
    ),
  }),
);

export type WorkspaceNoteRow = typeof workspaceNotes.$inferSelect;
