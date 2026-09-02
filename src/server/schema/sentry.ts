import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Sentry: continuous-ish security watchdog for a connection. Probes
 * the project's anon REST surface + reads pg_policies through the
 * direct Postgres URL to detect drift (RLS turned off, new tables
 * exposed to anon, PII-flavoured columns suddenly anon-readable).
 */

export type FindingKind =
  | "rls_disabled"
  | "anon_read"
  | "anon_read_pii"
  | "policy_overly_permissive"
  | "public_bucket"
  | "scan_error";

export type FindingSeverity = "info" | "warn" | "critical";

export type FindingStatus = "open" | "acknowledged" | "quarantined" | "resolved";

export interface FindingDetails {
  /** Free-form payload describing what the probe saw. Stable shape per kind. */
  matchedColumns?: string[];
  policyName?: string;
  policyDefinition?: string;
  rowCount?: number;
  message?: string;
}

export const sentryScans = pgTable(
  "sentry_scan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    tablesScanned: text("tables_scanned").array().default([]).notNull(),
    findingsCount: text("findings_count").default("0").notNull(),
    error: text("error"),
  },
  (t) => ({
    perConnIdx: index("sentry_scan_per_conn_idx").on(t.userId, t.connectionId, t.startedAt),
    workspaceRecent: index("sentry_scan_workspace_recent_idx").on(
      t.connectionId,
      t.startedAt.desc(),
    ),
  }),
);

export type SentryScanRow = typeof sentryScans.$inferSelect;

export const sentryFindings = pgTable(
  "sentry_finding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** The scan that originally surfaced this finding. */
    discoveredInScanId: uuid("discovered_in_scan_id").references(() => sentryScans.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<FindingKind>().notNull(),
    severity: text("severity").$type<FindingSeverity>().notNull(),
    status: text("status").$type<FindingStatus>().default("open").notNull(),
    schemaName: text("schema_name"),
    tableName: text("table_name"),
    columnName: text("column_name"),
    details: jsonb("details").$type<FindingDetails>().default({}).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Where Sentry stored the temporary RLS policy name when quarantined,
     *  so we can lift it cleanly on dismiss. */
    quarantinePolicyName: text("quarantine_policy_name"),
  },
  (t) => ({
    // Matches listFindings:
    //   WHERE user_id=? AND conn_id=? [AND status=?]
    //   ORDER BY last_seen_at DESC
    // The trailing column lets the planner skip the heap sort.
    perConnRecent: index("sentry_finding_per_conn_recent_idx").on(
      t.userId,
      t.connectionId,
      t.status,
      t.lastSeenAt.desc(),
    ),
    perTableIdx: index("sentry_finding_per_table_idx").on(
      t.userId,
      t.connectionId,
      t.schemaName,
      t.tableName,
    ),
    workspaceRecent: index("sentry_finding_workspace_recent_idx").on(
      t.connectionId,
      t.status,
      t.lastSeenAt.desc(),
    ),
  }),
);

export type SentryFindingRow = typeof sentryFindings.$inferSelect;
