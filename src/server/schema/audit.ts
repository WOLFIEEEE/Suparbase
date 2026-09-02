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
    // Compound index serving the dominant access pattern: "show me
    // the recent audit rows for user X on connection Y". Covers every
    // recent-audit, undo, AI-tool, and detail-page read.
    byConnRecent: index("audit_conn_recent_idx").on(
      t.userId,
      t.connectionId,
      t.createdAt.desc(),
    ),
    // Team workspaces read the complete connection timeline after the route
    // authorizes membership, regardless of which member performed the write.
    byWorkspaceRecent: index("audit_workspace_recent_idx").on(
      t.connectionId,
      t.createdAt.desc(),
    ),
    // Per-session view (Sentry / "what did this Cursor session do?").
    bySessionRecent: index("audit_session_created_idx").on(
      t.sessionId,
      t.createdAt.desc(),
    ),
    // Retention sweep (`WHERE created_at < $cutoff`). Kept as a single
    // column so the partitioned scan is cheap.
    createdAtIdx: index("audit_created_at_idx").on(t.createdAt),
  }),
);

export type AuditRow = typeof auditLog.$inferSelect;
