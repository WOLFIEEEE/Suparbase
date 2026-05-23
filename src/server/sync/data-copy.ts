import "server-only";
import { pipeline } from "node:stream/promises";
import type postgres from "postgres";
import type { TablePlan } from "./plan";
import { quoteIdent, quoteLiteral, tableIdent } from "./sql-util";

/**
 * Copy one table base → target using a streamed `COPY`:
 *
 *   base:   COPY (SELECT <projection> FROM tbl [LIMIT cap]) TO STDOUT
 *   target: COPY tbl (<cols>) FROM STDIN
 *
 * FK resolutions (null / remap) are applied *in the base-side projection*
 * so the wire data is already correct — no per-row work in Node. Generated
 * (stored) columns are excluded from the column list. Identity columns keep
 * base's values (COPY loads them verbatim); sequences are reset afterwards.
 *
 * COPY text format preserves every type exactly, which a hand-rolled INSERT
 * can't guarantee (jsonb, arrays, bytea, ranges, …).
 */
export async function copyTable(
  baseSql: postgres.Sql<Record<string, never>>,
  targetTx: postgres.TransactionSql<Record<string, never>>,
  plan: TablePlan,
): Promise<number> {
  if (plan.columns.length === 0) return 0;

  const transformByCol = new Map(plan.transforms.map((t) => [t.column, t]));
  const anonByCol = new Map(plan.anonymize.map((a) => [a.column, a]));

  const projection = plan.columns
    .map((col) => {
      // Anonymization takes precedence over FK resolution on the same column.
      const anon = anonByCol.get(col);
      if (anon) {
        const id = quoteIdent(col);
        switch (anon.strategy) {
          case "null":
            return `NULL::${anon.castType} AS ${id}`;
          case "fixed":
            return `${quoteLiteral(anon.value ?? "")}::${anon.castType} AS ${id}`;
          case "hash":
            return `md5(${id}::text) AS ${id}`;
          case "email":
            return `('user_' || substr(md5(${id}::text), 1, 12) || '@example.com') AS ${id}`;
        }
      }
      const tf = transformByCol.get(col);
      if (!tf) return quoteIdent(col);
      if (tf.strategy === "null") {
        return `NULL::${tf.castType} AS ${quoteIdent(col)}`;
      }
      // remap: emit a validated literal cast to the column's type. The cast
      // makes Postgres reject a malformed value; the literal is escaped.
      return `${quoteLiteral(tf.remapTo ?? "")}::${tf.castType} AS ${quoteIdent(col)}`;
    })
    .join(", ");

  const colList = plan.columns.map(quoteIdent).join(", ");
  const ident = tableIdent(plan.schema, plan.name);
  const limit = plan.rowCap != null && plan.rowCap >= 0 ? ` LIMIT ${Math.floor(plan.rowCap)}` : "";

  const copyOut = `COPY (SELECT ${projection} FROM ${ident}${limit}) TO STDOUT`;
  const copyIn = `COPY ${ident} (${colList}) FROM STDIN`;

  const readable = await baseSql.unsafe(copyOut).readable();
  const inboundQuery = targetTx.unsafe(copyIn);
  const writable = await inboundQuery.writable();

  await pipeline(readable, writable);

  // Awaiting the COPY-FROM query after the stream finishes resolves with the
  // command result; `.count` is the number of rows loaded. Fall back to the
  // estimate if the driver doesn't surface it.
  try {
    const result = (await inboundQuery) as unknown as { count?: number };
    if (typeof result?.count === "number") return result.count;
  } catch {
    /* stream already drained; ignore */
  }
  return plan.rowCap != null ? Math.min(plan.rowCap, plan.estimatedRows) : plan.estimatedRows;
}
