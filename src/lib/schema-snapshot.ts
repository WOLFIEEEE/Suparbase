import type { Schema } from "@/lib/types/schema";

/**
 * Compact, storage-friendly view of an introspected schema plus a pure
 * diff between two of them. Shared by the schema-snapshot repo (server),
 * the drift page (client), and the unit tests. Deliberately excludes
 * derived UI fields (category, labelColumn) so a snapshot only changes
 * when the database does.
 */

export interface SnapshotColumn {
  name: string;
  pgType: string;
  nullable: boolean;
  defaultValue: string | null;
  fk?: { schema: string; table: string; column: string };
}

export interface SnapshotTable {
  schema: string;
  name: string;
  kind: "table" | "view";
  primaryKey: string[];
  columns: SnapshotColumn[];
}

export function toSnapshotTables(schema: Schema): SnapshotTable[] {
  return schema.tables
    .map((t) => ({
      schema: t.schema,
      name: t.name,
      kind: t.kind,
      primaryKey: [...t.primaryKey],
      columns: t.columns.map((c) => ({
        name: c.name,
        pgType: c.pgType,
        nullable: c.nullable,
        defaultValue: c.defaultValue ?? null,
        ...(c.fk ? { fk: { schema: c.fk.schema, table: c.fk.table, column: c.fk.column } } : {}),
      })),
    }))
    .sort((a, b) => qualified(a).localeCompare(qualified(b)));
}

export function qualified(t: { schema: string; name: string }): string {
  return `${t.schema}.${t.name}`;
}

export type ColumnChangeKind = "type" | "nullable" | "default" | "fk";

export interface ColumnChange {
  column: string;
  kind: ColumnChangeKind;
  from: string;
  to: string;
}

export interface TableDiff {
  table: string;
  addedColumns: SnapshotColumn[];
  removedColumns: SnapshotColumn[];
  changedColumns: ColumnChange[];
  primaryKeyChanged: { from: string[]; to: string[] } | null;
}

export interface SnapshotDiff {
  addedTables: SnapshotTable[];
  removedTables: SnapshotTable[];
  changedTables: TableDiff[];
  /** True when nothing differs. */
  identical: boolean;
  /** Total number of individual changes, for a badge. */
  changeCount: number;
}

function fkKey(fk: SnapshotColumn["fk"]): string {
  return fk ? `${fk.schema}.${fk.table}.${fk.column}` : "";
}

function diffColumns(before: SnapshotTable, after: SnapshotTable): TableDiff | null {
  const beforeCols = new Map(before.columns.map((c) => [c.name, c]));
  const afterCols = new Map(after.columns.map((c) => [c.name, c]));
  const addedColumns: SnapshotColumn[] = [];
  const removedColumns: SnapshotColumn[] = [];
  const changedColumns: ColumnChange[] = [];

  for (const [name, col] of afterCols) {
    const prev = beforeCols.get(name);
    if (!prev) {
      addedColumns.push(col);
      continue;
    }
    if (prev.pgType !== col.pgType) {
      changedColumns.push({ column: name, kind: "type", from: prev.pgType, to: col.pgType });
    }
    if (prev.nullable !== col.nullable) {
      changedColumns.push({
        column: name,
        kind: "nullable",
        from: prev.nullable ? "nullable" : "not null",
        to: col.nullable ? "nullable" : "not null",
      });
    }
    if ((prev.defaultValue ?? "") !== (col.defaultValue ?? "")) {
      changedColumns.push({
        column: name,
        kind: "default",
        from: prev.defaultValue ?? "(none)",
        to: col.defaultValue ?? "(none)",
      });
    }
    if (fkKey(prev.fk) !== fkKey(col.fk)) {
      changedColumns.push({
        column: name,
        kind: "fk",
        from: fkKey(prev.fk) || "(none)",
        to: fkKey(col.fk) || "(none)",
      });
    }
  }
  for (const [name, col] of beforeCols) {
    if (!afterCols.has(name)) removedColumns.push(col);
  }

  const pkBefore = before.primaryKey.join(",");
  const pkAfter = after.primaryKey.join(",");
  const primaryKeyChanged =
    pkBefore !== pkAfter ? { from: [...before.primaryKey], to: [...after.primaryKey] } : null;

  if (
    addedColumns.length === 0 &&
    removedColumns.length === 0 &&
    changedColumns.length === 0 &&
    !primaryKeyChanged
  ) {
    return null;
  }
  return {
    table: qualified(after),
    addedColumns,
    removedColumns,
    changedColumns,
    primaryKeyChanged,
  };
}

/** Diff `before` → `after`. Tables are matched on schema-qualified name. */
export function diffSnapshots(before: SnapshotTable[], after: SnapshotTable[]): SnapshotDiff {
  const beforeMap = new Map(before.map((t) => [qualified(t), t]));
  const afterMap = new Map(after.map((t) => [qualified(t), t]));
  const addedTables: SnapshotTable[] = [];
  const removedTables: SnapshotTable[] = [];
  const changedTables: TableDiff[] = [];

  for (const [key, t] of afterMap) {
    const prev = beforeMap.get(key);
    if (!prev) {
      addedTables.push(t);
      continue;
    }
    const d = diffColumns(prev, t);
    if (d) changedTables.push(d);
  }
  for (const [key, t] of beforeMap) {
    if (!afterMap.has(key)) removedTables.push(t);
  }

  const changeCount =
    addedTables.length +
    removedTables.length +
    changedTables.reduce(
      (n, d) =>
        n +
        d.addedColumns.length +
        d.removedColumns.length +
        d.changedColumns.length +
        (d.primaryKeyChanged ? 1 : 0),
      0,
    );

  return {
    addedTables,
    removedTables,
    changedTables,
    identical: changeCount === 0,
    changeCount,
  };
}

/** Human one-liner for a diff, used in notifications and list rows. */
export function summarizeDiff(diff: SnapshotDiff): string {
  if (diff.identical) return "No changes";
  const parts: string[] = [];
  if (diff.addedTables.length) parts.push(`+${diff.addedTables.length} table${diff.addedTables.length === 1 ? "" : "s"}`);
  if (diff.removedTables.length) parts.push(`-${diff.removedTables.length} table${diff.removedTables.length === 1 ? "" : "s"}`);
  const colAdds = diff.changedTables.reduce((n, d) => n + d.addedColumns.length, 0);
  const colDrops = diff.changedTables.reduce((n, d) => n + d.removedColumns.length, 0);
  const colChanges = diff.changedTables.reduce((n, d) => n + d.changedColumns.length, 0);
  if (colAdds) parts.push(`+${colAdds} column${colAdds === 1 ? "" : "s"}`);
  if (colDrops) parts.push(`-${colDrops} column${colDrops === 1 ? "" : "s"}`);
  if (colChanges) parts.push(`${colChanges} altered`);
  return parts.join(" · ");
}
