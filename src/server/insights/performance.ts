import "server-only";
import postgres from "postgres";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { assertSafePostgresConnectionString } from "@/server/security/egress";
import { computeSuggestions } from "@/lib/performance/advisor";
import type {
  ExtensionInfo,
  IndexStat,
  PerformanceReport,
  StatementStat,
  TableStat,
} from "@/lib/performance/types";

const STATEMENT_TIMEOUT_MS = 15_000;
const TABLE_LIMIT = 200;
const INDEX_LIMIT = 300;
const STATEMENT_LIMIT = 15;
const QUERY_TEXT_CAP = 400;

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return new Date(v).toISOString();
  return null;
}

/**
 * Collect pg_stat_* health numbers for the Performance page inside one
 * read-only transaction on the connection's Direct Postgres URL. Nothing
 * here touches user rows: only catalog + statistics views.
 */
export async function collectPerformance(conn: ConnectionRow): Promise<PerformanceReport> {
  if (!conn.encryptedPostgresUrl) throw new NoPostgresUrlError();
  const url = await assertSafePostgresConnectionString(decryptKey(conn.encryptedPostgresUrl));
  const sql = postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });

  try {
    return await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

      const [size] = await tx.unsafe(`select pg_database_size(current_database())::bigint as bytes`);
      const [heap] = await tx.unsafe(
        `select coalesce(sum(heap_blks_hit),0)::float8 as hit, coalesce(sum(heap_blks_read),0)::float8 as read from pg_statio_user_tables`,
      );
      const [idx] = await tx.unsafe(
        `select coalesce(sum(idx_blks_hit),0)::float8 as hit, coalesce(sum(idx_blks_read),0)::float8 as read from pg_statio_user_indexes`,
      );
      const [conns] = await tx.unsafe(
        `select count(*) filter (where state = 'active')::int as active,
                count(*) filter (where state like 'idle%')::int as idle
           from pg_stat_activity where datname = current_database()`,
      );
      const [maxConn] = await tx.unsafe(`select setting::int as max from pg_settings where name = 'max_connections'`);

      const tableRows = await tx.unsafe(
        `select n.nspname as schema, c.relname as name,
                pg_total_relation_size(c.oid)::bigint as total_bytes,
                pg_relation_size(c.oid)::bigint as table_bytes,
                pg_indexes_size(c.oid)::bigint as index_bytes,
                greatest(c.reltuples, 0)::bigint as estimated_rows,
                coalesce(s.seq_scan, 0)::bigint as seq_scan,
                coalesce(s.seq_tup_read, 0)::bigint as seq_tup_read,
                coalesce(s.idx_scan, 0)::bigint as idx_scan,
                coalesce(s.n_live_tup, 0)::bigint as live_tuples,
                coalesce(s.n_dead_tup, 0)::bigint as dead_tuples,
                s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           left join pg_stat_user_tables s on s.relid = c.oid
          where c.relkind in ('r', 'p')
            and n.nspname not in (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
            and n.nspname not like 'pg_temp%'
          order by pg_total_relation_size(c.oid) desc
          limit ${TABLE_LIMIT}`,
      );
      const tables: TableStat[] = tableRows.map((r) => ({
        schema: String(r.schema),
        name: String(r.name),
        totalBytes: num(r.total_bytes),
        tableBytes: num(r.table_bytes),
        indexBytes: num(r.index_bytes),
        estimatedRows: num(r.estimated_rows),
        seqScan: num(r.seq_scan),
        seqTupRead: num(r.seq_tup_read),
        idxScan: num(r.idx_scan),
        liveTuples: num(r.live_tuples),
        deadTuples: num(r.dead_tuples),
        lastVacuum: iso(r.last_vacuum),
        lastAutovacuum: iso(r.last_autovacuum),
        lastAnalyze: iso(r.last_analyze),
        lastAutoanalyze: iso(r.last_autoanalyze),
      }));

      const indexRows = await tx.unsafe(
        `select n.nspname as schema, t.relname as "table", i.relname as name,
                pg_relation_size(i.oid)::bigint as bytes,
                coalesce(s.idx_scan, 0)::bigint as scans,
                ix.indisunique as is_unique, ix.indisprimary as is_primary,
                pg_get_indexdef(i.oid) as definition
           from pg_index ix
           join pg_class i on i.oid = ix.indexrelid
           join pg_class t on t.oid = ix.indrelid
           join pg_namespace n on n.oid = t.relnamespace
           left join pg_stat_user_indexes s on s.indexrelid = i.oid
          where n.nspname not in (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
          order by pg_relation_size(i.oid) desc
          limit ${INDEX_LIMIT}`,
      );
      const indexes: IndexStat[] = indexRows.map((r) => ({
        schema: String(r.schema),
        table: String(r.table),
        name: String(r.name),
        bytes: num(r.bytes),
        scans: num(r.scans),
        isUnique: Boolean(r.is_unique),
        isPrimary: Boolean(r.is_primary),
        definition: String(r.definition ?? ""),
      }));

      const extRows = await tx.unsafe(`select extname, extversion from pg_extension order by extname`);
      const extensions: ExtensionInfo[] = extRows.map((r) => ({
        name: String(r.extname),
        version: String(r.extversion ?? ""),
      }));

      let statements: StatementStat[] = [];
      let hasStatStatements = extensions.some((e) => e.name === "pg_stat_statements");
      if (hasStatStatements) {
        try {
          await tx.unsafe("SAVEPOINT stat_statements");
          const rows = await tx.unsafe(
            `select query, calls::bigint as calls, total_exec_time::float8 as total_ms,
                    mean_exec_time::float8 as mean_ms, rows::bigint as rows
               from pg_stat_statements
              where dbid = (select oid from pg_database where datname = current_database())
              order by total_exec_time desc
              limit ${STATEMENT_LIMIT}`,
          );
          statements = rows.map((r) => ({
            query: String(r.query ?? "").replace(/\s+/g, " ").trim().slice(0, QUERY_TEXT_CAP),
            calls: num(r.calls),
            totalMs: num(r.total_ms),
            meanMs: num(r.mean_ms),
            rows: num(r.rows),
          }));
        } catch {
          // The view may live in a schema outside search_path, or the role
          // may lack pg_read_all_stats. Report as unavailable, not an error.
          await tx.unsafe("ROLLBACK TO SAVEPOINT stat_statements");
          hasStatStatements = false;
        }
      }

      const heapTotal = num(heap?.hit) + num(heap?.read);
      const idxTotal = num(idx?.hit) + num(idx?.read);
      const connections = {
        active: num(conns?.active),
        idle: num(conns?.idle),
        max: num(maxConn?.max),
      };
      const cacheHitRatio = heapTotal > 0 ? num(heap?.hit) / heapTotal : null;

      return {
        collectedAt: new Date().toISOString(),
        databaseBytes: num(size?.bytes),
        cacheHitRatio,
        indexHitRatio: idxTotal > 0 ? num(idx?.hit) / idxTotal : null,
        connections,
        tables,
        indexes,
        statements,
        hasStatStatements,
        extensions,
        suggestions: computeSuggestions({ tables, indexes, cacheHitRatio, connections }),
      };
    });
  } finally {
    await sql.end({ timeout: 2 });
  }
}
