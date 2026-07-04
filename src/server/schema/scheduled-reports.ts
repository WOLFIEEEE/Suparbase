import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";
import { sqlSnippets } from "./sql-snippets";

/**
 * Scheduled query digests (v3.17). Runs a saved SQL snippet on an interval
 * and delivers the result set — as an HTML table + CSV attachment by email,
 * or a JSON POST to a webhook. Reuses the same read-only SQL path as the
 * playground, so a report can never write. Triggered by the shared cron
 * contract (Bearer CRON_SECRET) at /api/cron/reports.
 */
export type ReportDelivery = "email" | "webhook";

export const scheduledReports = pgTable(
  "scheduled_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** The snippet whose SQL is run. Deleting the snippet deletes the report. */
    snippetId: uuid("snippet_id")
      .notNull()
      .references(() => sqlSnippets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    delivery: text("delivery").$type<ReportDelivery>().notNull(),
    /** Recipient email (delivery=email) or webhook URL (delivery=webhook). */
    target: text("target").notNull(),
    intervalHours: integer("interval_hours").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnIdx: index("scheduled_report_per_conn_idx").on(t.userId, t.connectionId),
    dueIdx: index("scheduled_report_due_idx").on(t.enabled, t.lastRunAt),
  }),
);

export type ScheduledReportRow = typeof scheduledReports.$inferSelect;
