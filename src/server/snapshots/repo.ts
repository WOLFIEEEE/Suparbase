import "server-only";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/server/db";
import { schemaSnapshots, type SnapshotSource } from "@/server/schema/schema-snapshots";
import { fingerprintSchema } from "@/server/ai/fingerprint";
import { toSnapshotTables, type SnapshotTable } from "@/lib/schema-snapshot";
import type { Schema } from "@/lib/types/schema";

/** Newest snapshots kept per connection; older ones are pruned on insert. */
const MAX_SNAPSHOTS_PER_CONNECTION = 50;

export interface SnapshotSummary {
  id: string;
  fingerprint: string;
  source: SnapshotSource;
  label: string | null;
  tableCount: number;
  columnCount: number;
  createdAt: string;
  createdBy: string | null;
}

const summaryColumns = {
  id: schemaSnapshots.id,
  fingerprint: schemaSnapshots.fingerprint,
  source: schemaSnapshots.source,
  label: schemaSnapshots.label,
  tableCount: schemaSnapshots.tableCount,
  columnCount: schemaSnapshots.columnCount,
  createdAt: schemaSnapshots.createdAt,
  createdBy: schemaSnapshots.createdBy,
};

type SummaryRow = {
  id: string;
  fingerprint: string;
  source: SnapshotSource;
  label: string | null;
  tableCount: number;
  columnCount: number;
  createdAt: Date;
  createdBy: string | null;
};

function toSummary(row: SummaryRow): SnapshotSummary {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listSnapshots(connectionId: string): Promise<SnapshotSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(schemaSnapshots)
    .where(eq(schemaSnapshots.connectionId, connectionId))
    .orderBy(desc(schemaSnapshots.createdAt))
    .limit(MAX_SNAPSHOTS_PER_CONNECTION);
  return rows.map(toSummary);
}

export async function getSnapshot(
  connectionId: string,
  id: string,
): Promise<{ summary: SnapshotSummary; tables: SnapshotTable[] } | null> {
  const rows = await db
    .select({ ...summaryColumns, tables: schemaSnapshots.tables })
    .from(schemaSnapshots)
    .where(and(eq(schemaSnapshots.connectionId, connectionId), eq(schemaSnapshots.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const { tables, ...summary } = row;
  return { summary: toSummary(summary), tables };
}

export async function latestSnapshot(connectionId: string): Promise<SnapshotSummary | null> {
  const rows = await db
    .select(summaryColumns)
    .from(schemaSnapshots)
    .where(eq(schemaSnapshots.connectionId, connectionId))
    .orderBy(desc(schemaSnapshots.createdAt))
    .limit(1);
  return rows[0] ? toSummary(rows[0]) : null;
}

export interface RecordSnapshotOptions {
  source: SnapshotSource;
  createdBy?: string | null;
  label?: string | null;
  /** Insert even when the fingerprint matches the latest snapshot. */
  force?: boolean;
}

export interface RecordSnapshotResult {
  snapshot: SnapshotSummary;
  /** True when a new row was inserted (schema differed or force was set). */
  inserted: boolean;
  /** The snapshot that was latest before this call, if any. */
  previous: SnapshotSummary | null;
}

/**
 * Persist a snapshot of `schema` unless it is byte-for-byte the same shape
 * as the most recent one. Auto captures call this on every introspection,
 * so the fingerprint short-circuit is what keeps the table small.
 */
export async function recordSnapshot(
  connectionId: string,
  schema: Schema,
  opts: RecordSnapshotOptions,
): Promise<RecordSnapshotResult> {
  const fingerprint = fingerprintSchema(schema);
  const previous = await latestSnapshot(connectionId);
  if (previous && previous.fingerprint === fingerprint && !opts.force) {
    return { snapshot: previous, inserted: false, previous };
  }
  const tables = toSnapshotTables(schema);
  const [row] = await db
    .insert(schemaSnapshots)
    .values({
      connectionId,
      createdBy: opts.createdBy ?? null,
      fingerprint,
      source: opts.source,
      label: opts.label ?? null,
      tableCount: tables.length,
      columnCount: tables.reduce((n, t) => n + t.columns.length, 0),
      tables,
    })
    .returning(summaryColumns);
  await pruneSnapshots(connectionId);
  return { snapshot: toSummary(row!), inserted: true, previous };
}

async function pruneSnapshots(connectionId: string): Promise<void> {
  const keep = await db
    .select({ id: schemaSnapshots.id })
    .from(schemaSnapshots)
    .where(eq(schemaSnapshots.connectionId, connectionId))
    .orderBy(desc(schemaSnapshots.createdAt))
    .limit(MAX_SNAPSHOTS_PER_CONNECTION);
  if (keep.length < MAX_SNAPSHOTS_PER_CONNECTION) return;
  await db.delete(schemaSnapshots).where(
    and(
      eq(schemaSnapshots.connectionId, connectionId),
      notInArray(
        schemaSnapshots.id,
        keep.map((k) => k.id),
      ),
    ),
  );
}

export async function deleteSnapshot(connectionId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(schemaSnapshots)
    .where(and(eq(schemaSnapshots.connectionId, connectionId), eq(schemaSnapshots.id, id)))
    .returning({ id: schemaSnapshots.id });
  return rows.length > 0;
}
