import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * In-app notifications (v3.20). One row per recipient per event so
 * read-state is personal. Emitted by the same code paths that already
 * fire webhooks (Sentry criticals, data watches, failed reports and
 * scheduled syncs, team invitations) so users without a Slack hook still
 * see what happened. Pruned per user by the repo.
 */
export type NotificationKind =
  | "sentry_critical"
  | "sentry_scan"
  | "watch_alert"
  | "report_failed"
  | "sync_failed"
  | "invitation"
  | "schema_changed"
  | "system";

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** In-app destination, e.g. /c/<id>/sentry. */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perUserRecent: index("notification_per_user_recent_idx").on(t.userId, t.createdAt.desc()),
    perUserUnread: index("notification_per_user_unread_idx").on(t.userId, t.readAt),
  }),
);

export type NotificationRow = typeof notifications.$inferSelect;
