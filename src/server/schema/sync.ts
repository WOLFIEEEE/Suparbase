import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

/**
 * Database sync (v3.2). A sync_profile is a reusable, named config that
 * copies a **base** connection (prod — read, never written) into a
 * **target** connection (staging — made to mirror base) using a
 * full-replace-per-table strategy. A sync_run is one execution of a
 * profile (or an ad-hoc run), tracked like an `agent_session`: a status
 * enum, a current phase, and jsonb stats.
 *
 * Sync is a Direct-Postgres-only feature: both connections must have a
 * `encrypted_postgres_url`. The base is opened only inside READ ONLY
 * transactions — there is no writable base handle anywhere in the code.
 */

// --- Profile config shapes (stored as jsonb) -------------------------------

/** What to do with a table during a run. */
export type TableAction =
  /** Truncate the target table and copy base's rows in. */
  | "sync"
  /** User-scoped: leave the target table exactly as-is (never touched). */
  | "exclude"
  /** Don't sync and don't touch — used to resolve downstream-of-excluded. */
  | "skip";

/** How to rewrite an FK column whose parent table is excluded/skipped. */
export type FkResolutionStrategy = "null" | "remap";

export interface FkResolution {
  strategy: FkResolutionStrategy;
  /** Fixed target value to remap every row's FK column to (strategy=remap). */
  remapTo?: string;
}

/** How to scrub a column's values during copy (applied in the base SELECT). */
export type AnonStrategy =
  /** Write NULL (column must be nullable). */
  | "null"
  /** Write a fixed literal. */
  | "fixed"
  /** Deterministic md5 hash of the value (text columns). */
  | "hash"
  /** Synthetic email derived from the value's hash (text columns). */
  | "email";

export interface AnonRule {
  strategy: AnonStrategy;
  /** Literal value for strategy=fixed. */
  value?: string;
}

export interface TableRule {
  action: TableAction;
  /** Per-column FK resolution, keyed by column name. Only for `sync` tables. */
  fk?: Record<string, FkResolution>;
  /** Per-column anonymization, keyed by column name. Only for `sync` tables. */
  anonymize?: Record<string, AnonRule>;
}

export interface SyncTableConfig {
  /** Keyed by qualified `schema.table`. Tables absent here default to sync. */
  tables: Record<string, TableRule>;
}

export interface SyncOptions {
  /** Apply schema DDL to target before copying (Phase 2+). */
  applySchema: boolean;
  /** Allow destructive DDL (drop table/column, narrowing changes). */
  allowDestructive: boolean;
  /** Per-table row cap; null = copy every row. */
  rowCap: number | null;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  applySchema: false,
  allowDestructive: false,
  rowCap: null,
};

export const DEFAULT_SYNC_TABLE_CONFIG: SyncTableConfig = { tables: {} };

// --- Run shapes ------------------------------------------------------------

export type SyncRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "aborted";

export type SyncRunPhase =
  | "introspect"
  | "schema_diff"
  | "schema_apply"
  | "truncate"
  | "data_copy"
  | "sequences"
  | "done";

export interface SyncRunTableStat {
  table: string;
  rowsCopied: number;
  durationMs: number;
  skipped?: boolean;
  error?: string;
}

export interface SyncRunStats {
  tables: SyncRunTableStat[];
  warnings: string[];
}

export const EMPTY_SYNC_RUN_STATS: SyncRunStats = { tables: [], warnings: [] };

// --- Tables ----------------------------------------------------------------

export const syncProfiles = pgTable(
  "sync_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseConnectionId: uuid("base_connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    targetConnectionId: uuid("target_connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    options: jsonb("options")
      .$type<SyncOptions>()
      .default(DEFAULT_SYNC_OPTIONS)
      .notNull(),
    tableConfig: jsonb("table_config")
      .$type<SyncTableConfig>()
      .default(DEFAULT_SYNC_TABLE_CONFIG)
      .notNull(),

    /** When set, a cron run executes this profile every N hours (no manual
     * confirmation — enabling the schedule is the consent). Null = manual only. */
    scheduleIntervalHours: integer("schedule_interval_hours"),
    lastScheduledRunAt: timestamp("last_scheduled_run_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Lists are "this user's profiles for this target connection, most
    // recently updated first"; the (user, target, updated) compound serves it.
    byUserTarget: index("sync_profile_user_target_idx").on(
      t.userId,
      t.targetConnectionId,
      t.updatedAt.desc(),
    ),
    uniqueUserName: unique("sync_profile_user_name_unique").on(t.userId, t.name),
  }),
);

export const syncRuns = pgTable(
  "sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Runs outlive the profile they came from (kept for history).
    profileId: uuid("profile_id").references(() => syncProfiles.id, {
      onDelete: "set null",
    }),
    baseConnectionId: uuid("base_connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    targetConnectionId: uuid("target_connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    status: text("status").$type<SyncRunStatus>().default("pending").notNull(),
    phase: text("phase").$type<SyncRunPhase>(),
    dryRun: boolean("dry_run").default(false).notNull(),

    stats: jsonb("stats").$type<SyncRunStats>().default(EMPTY_SYNC_RUN_STATS).notNull(),
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    // Run history for a target connection, newest first.
    byTargetRecent: index("sync_run_target_recent_idx").on(
      t.userId,
      t.targetConnectionId,
      t.startedAt.desc(),
    ),
  }),
);

export type SyncProfileRow = typeof syncProfiles.$inferSelect;
export type SyncProfileInsert = typeof syncProfiles.$inferInsert;
export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncRunInsert = typeof syncRuns.$inferInsert;
