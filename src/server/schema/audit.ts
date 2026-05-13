import { index, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    schemaName: text("schema_name").notNull(),
    tableName: text("table_name").notNull(),
    primaryKey: jsonb("primary_key").$type<Record<string, unknown>>(),
    verb: text("verb").$type<"insert" | "update" | "delete">().notNull(),
    httpStatus: smallint("http_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId),
    connectionIdx: index("audit_connection_idx").on(t.connectionId),
    createdAtIdx: index("audit_created_at_idx").on(t.createdAt),
  }),
);

export type AuditRow = typeof auditLog.$inferSelect;
