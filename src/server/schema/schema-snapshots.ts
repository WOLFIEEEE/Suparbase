import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";
import type { SnapshotTable } from "../../lib/schema-snapshot";

/**
 * Schema snapshots (v3.20). A compact copy of the introspected schema,
 * captured automatically whenever the schema fingerprint changes between
 * introspections and on demand from the Schema page. Two snapshots diff
 * into an added / removed / changed report, which is how a team answers
 * "what changed in the database since Tuesday?" without a migration log.
 * Pruned to the newest N per connection by the repo.
 */
export type SnapshotSource = "auto" | "manual";

export const schemaSnapshots = pgTable(
  "schema_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** Who triggered it; null for automatic captures or deleted users. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** SHA-256 over table/column/type triples; same function the AI cache uses. */
    fingerprint: text("fingerprint").notNull(),
    source: text("source").$type<SnapshotSource>().notNull().default("auto"),
    label: text("label"),
    tableCount: integer("table_count").notNull(),
    columnCount: integer("column_count").notNull(),
    tables: jsonb("tables").$type<SnapshotTable[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnRecent: index("schema_snapshot_per_conn_recent_idx").on(t.connectionId, t.createdAt.desc()),
  }),
);

export type SchemaSnapshotRow = typeof schemaSnapshots.$inferSelect;
