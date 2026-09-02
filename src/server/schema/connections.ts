import { customType, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Deployment tier the connection points at. Drives the coloured badge in
 * the workspace chrome and the extra typed confirmation on destructive
 * actions against `production`. Null = the owner hasn't labelled it.
 */
export type ConnectionEnvironment = "production" | "staging" | "development" | "other";
export const CONNECTION_ENVIRONMENTS: readonly ConnectionEnvironment[] = [
  "production",
  "staging",
  "development",
  "other",
];

const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value): Uint8Array {
    if (value instanceof Uint8Array) return value;
    if (Buffer.isBuffer(value)) return new Uint8Array(value);
    if (typeof value === "string" && value.startsWith("\\x")) {
      return new Uint8Array(Buffer.from(value.slice(2), "hex"));
    }
    throw new Error("Unexpected bytea value shape from driver");
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
});

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    role: text("role").$type<"anon" | "authenticated" | "service_role" | "unknown">().notNull(),
    encryptedKey: bytea("encrypted_key").notNull(),
    /**
     * Optional direct Postgres connection string (postgres://...). Encrypted
     * with the same vault key. Used only for RLS introspection / policy
     * simulation; PostgREST remains the primary path for all CRUD.
     */
    encryptedPostgresUrl: bytea("encrypted_postgres_url"),
    /**
     * Optional webhook (Slack-compatible) notified when a Sentry scan
     * surfaces NEW critical findings on this connection. Validated
     * against the SSRF blocklist at save time and again at fire time.
     */
    alertWebhookUrl: text("alert_webhook_url"),
    /** Owner-assigned deployment tier (v3.20). Null until labelled. */
    environment: text("environment").$type<ConnectionEnvironment>(),
    /**
     * Scheduled Sentry scans (v3.20). Null/0 = off. When set, the
     * /api/cron/sentry route re-scans the connection every N hours and
     * fires the alert webhook + an in-app notification on new criticals.
     */
    sentryScanIntervalHours: integer("sentry_scan_interval_hours"),
    sentryLastAutoScanAt: timestamp("sentry_last_auto_scan_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Lists are always "this user's connections, most-recently-used
    // first". A single compound (user_id, last_used_at DESC) serves
    // it and supersedes the previous bare `user_idx`.
    byUserRecent: index("connections_user_recent_idx").on(
      t.userId,
      t.lastUsedAt.desc(),
    ),
    uniqueUserName: unique("connections_user_name_unique").on(t.userId, t.name),
  }),
);

export type ConnectionRow = typeof connections.$inferSelect;
export type ConnectionInsert = typeof connections.$inferInsert;
