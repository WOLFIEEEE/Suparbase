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
    /** Pre-write snapshot. Populated for DELETE and (when available) UPDATE. */
    beforeRow: jsonb("before_row").$type<Record<string, unknown>>(),
    /** Post-write snapshot. Populated for INSERT and UPDATE. */
    afterRow: jsonb("after_row").$type<Record<string, unknown>>(),
    /** Agent session this write belongs to (v3.1+). Nullable for writes
     *  that happened before Sentry was wired or for writes the
     *  fingerprinter couldn't bucket. */
    sessionId: uuid("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId),
    connectionIdx: index("audit_connection_idx").on(t.connectionId),
    createdAtIdx: index("audit_created_at_idx").on(t.createdAt),
    sessionIdx: index("audit_session_idx").on(t.sessionId),
  }),
);

export type AuditRow = typeof auditLog.$inferSelect;
