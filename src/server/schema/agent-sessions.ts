import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Agent sessions, the unit of attribution + undo. Every write that flows
 * through the proxy is fingerprinted from the User-Agent + token-bound
 * caller and bucketed into an `agent_session` row. Subsequent writes from
 * the same (user, connection, agent_kind, ua_hash) within the rolling
 * window extend the same session.
 *
 * Sessions are the atom of "Undo this Cursor session", every audit_log
 * row links back via `audit_log.session_id` so the undo engine can replay
 * every mutation in reverse from a single button.
 */

export type AgentKind =
  | "cursor"
  | "claude_code"
  | "replit_agent"
  | "lovable"
  | "v0"
  | "vercel_ai_sdk"
  | "openrouter"
  | "aider"
  | "cline"
  | "continue_dev"
  | "ai_unknown"
  | "browser"
  | "cli"
  | "unknown";

export type SessionStatus =
  | "active"
  | "closed"
  | "undone"
  | "undo_partial"
  | "undo_failed";

export const agentSessions = pgTable(
  "agent_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    kind: text("kind").$type<AgentKind>().notNull(),
    /** Pretty label shown in the UI, e.g. "Cursor (claude-opus-4-7)". */
    label: text("label").notNull(),
    userAgentRaw: text("user_agent_raw"),

    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    /** When the session was explicitly closed (e.g. on undo). */
    closedAt: timestamp("closed_at", { withTimezone: true }),

    status: text("status").$type<SessionStatus>().default("active").notNull(),
    mutationCount: integer("mutation_count").default(0).notNull(),
    /** Distinct (schema.table) values touched in this session. */
    tablesTouched: jsonb("tables_touched").$type<string[]>().default([]).notNull(),

    /** Undo accounting: how many audit_log rows were attempted / reversed. */
    undoAttemptedCount: integer("undo_attempted_count").default(0).notNull(),
    undoRevertedCount: integer("undo_reverted_count").default(0).notNull(),
    undoError: text("undo_error"),
  },
  (t) => ({
    // Single compound that covers both hot reads:
    //   - attachToSession lookup: WHERE user_id=? AND conn_id=? AND
    //     kind=? AND status='active' ORDER BY last_seen_at DESC LIMIT 1
    //   - listSessions: WHERE user_id=? AND conn_id=? ORDER BY
    //     last_seen_at DESC (uses the (user, conn, ...) prefix)
    // Replaces the previous `per_conn_idx` and `per_agent_idx` which
    // were both left-prefix-covered by this one.
    perAgentRecent: index("agent_session_per_agent_recent_idx").on(
      t.userId,
      t.connectionId,
      t.kind,
      t.status,
      t.lastSeenAt.desc(),
    ),
  }),
);

export type AgentSessionRow = typeof agentSessions.$inferSelect;
