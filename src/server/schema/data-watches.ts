import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Data watches / saved monitors (v3.17). A named SELECT is evaluated on an
 * interval; when it returns rows and the match count has GROWN since the
 * last check, an alert is POSTed to a webhook (Slack/Discord-compatible,
 * or the connection's Sentry alert webhook as a fallback). Debounced on the
 * row count so a persistently-true condition doesn't fire every tick.
 * Read-only: the SQL runs through the same guarded path as the playground.
 * Triggered by the shared cron contract at /api/cron/watches.
 */
export const dataWatches = pgTable(
  "data_watch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** A SELECT whose returned rows are the "matches" being watched. */
    sql: text("sql").notNull(),
    /** Webhook to alert. Null falls back to the connection's alert webhook. */
    webhookUrl: text("webhook_url"),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    enabled: boolean("enabled").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** Match count at the last check; an increase is what triggers an alert. */
    lastMatchCount: integer("last_match_count").notNull().default(0),
    lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnIdx: index("data_watch_per_conn_idx").on(t.userId, t.connectionId),
    dueIdx: index("data_watch_due_idx").on(t.enabled, t.lastCheckedAt),
  }),
);

export type DataWatchRow = typeof dataWatches.$inferSelect;
