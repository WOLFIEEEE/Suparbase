import "server-only";
import type postgres from "postgres";
import { qualify } from "./catalog";
import { quoteIdent, quoteLiteral, tableIdent } from "./sql-util";

interface OwnedSequence {
  seq_schema: string;
  seq_name: string;
  table_schema: string;
  table_name: string;
  column: string;
}

/**
 * After a full-replace load, advance every owned sequence (serial / identity)
 * to MAX(column) so the target's future inserts don't collide with the
 * primary keys we just copied from base. Runs inside the target transaction.
 * Failures are collected as warnings — a sequence we can't reset shouldn't
 * roll back an otherwise-good sync.
 */
export async function resetSequences(
  targetTx: postgres.TransactionSql<Record<string, never>>,
  syncedTables: Set<string>,
  schemas: string[],
): Promise<string[]> {
  const owned = await targetTx<OwnedSequence[]>`
    SELECT sn.nspname AS seq_schema,
           seq.relname AS seq_name,
           tn.nspname  AS table_schema,
           t.relname   AS table_name,
           a.attname   AS column
    FROM pg_class seq
    JOIN pg_namespace sn ON sn.oid = seq.relnamespace
    JOIN pg_depend d ON d.objid = seq.oid AND d.deptype IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE seq.relkind = 'S' AND tn.nspname = ANY(${schemas})
  `;

  const warnings: string[] = [];
  for (const s of owned) {
    const tableQualified = qualify(s.table_schema, s.table_name);
    if (!syncedTables.has(tableQualified)) continue;

    const seqLiteral = quoteLiteral(`${quoteIdent(s.seq_schema)}.${quoteIdent(s.seq_name)}`);
    const col = quoteIdent(s.column);
    const tbl = tableIdent(s.table_schema, s.table_name);
    try {
      // setval(seq, max, is_called): when the table is empty, set to 1 with
      // is_called=false so the next value is 1.
      await targetTx.unsafe(
        `SELECT setval(${seqLiteral},
                       COALESCE((SELECT MAX(${col}) FROM ${tbl}), 1),
                       (SELECT MAX(${col}) FROM ${tbl}) IS NOT NULL)`,
      );
    } catch (e) {
      warnings.push(
        `Could not reset sequence for ${tableQualified}.${s.column}: ${(e as Error).message}`,
      );
    }
  }
  return warnings;
}
