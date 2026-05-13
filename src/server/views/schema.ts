import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../schema/auth";
import { connections } from "../schema/connections";
import type { ViewState } from "@/lib/types/views";

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    tableSchema: text("table_schema").notNull(),
    tableName: text("table_name").notNull(),
    name: text("name").notNull(),
    state: jsonb("state").$type<ViewState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perTableIdx: index("saved_views_per_table_idx").on(
      t.userId,
      t.connectionId,
      t.tableSchema,
      t.tableName,
    ),
  }),
);

export type SavedViewRow = typeof savedViews.$inferSelect;
