import "server-only";
import { executeSql } from "@/server/proxy/sql-playground";
import { quoteIdent, tableIdent } from "@/server/sync/sql-util";
import type { ConnectionRow } from "@/server/schema/connections";

export interface ColumnStats {
  total: number;
  nonNull: number;
  nullCount: number;
  distinctCount: number;
  min: string | null;
  max: string | null;
  /** Most common values (any type), for a distribution bar. */
  topValues: Array<{ value: string | null; count: number }>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute lightweight stats for one column via the read-only SQL path.
 * Identifiers are quoted with the same helper the sync engine trusts;
 * values are never interpolated. Two small aggregate queries.
 */
export async function computeColumnStats(
  conn: ConnectionRow,
  schema: string,
  table: string,
  column: string,
): Promise<ColumnStats> {
  const ident = tableIdent(schema, table);
  const col = quoteIdent(column);

  const agg = await executeSql({
    conn,
    readOnly: true,
    statementTimeoutMs: 15_000,
    sql: `SELECT
        count(*)::bigint AS total,
        count(${col})::bigint AS non_null,
        count(DISTINCT ${col})::bigint AS distinct_count,
        min(${col})::text AS min_val,
        max(${col})::text AS max_val
      FROM ${ident}`,
  });
  const row = agg.rows[0] ?? [];
  const total = num(row[0]);
  const nonNull = num(row[1]);

  const top = await executeSql({
    conn,
    readOnly: true,
    statementTimeoutMs: 15_000,
    sql: `SELECT ${col}::text AS value, count(*)::bigint AS c
      FROM ${ident}
      GROUP BY ${col}
      ORDER BY c DESC
      LIMIT 8`,
  });

  return {
    total,
    nonNull,
    nullCount: total - nonNull,
    distinctCount: num(row[2]),
    min: (row[3] as string | null) ?? null,
    max: (row[4] as string | null) ?? null,
    topValues: top.rows.map((r) => ({
      value: (r[0] as string | null) ?? null,
      count: num(r[1]),
    })),
  };
}
