import type { IndexStat, Suggestion, TableStat } from "./types";

/**
 * Pure heuristics over pg_stat_* numbers. Deliberately conservative: each
 * rule needs real volume before it speaks up, so a fresh project with ten
 * rows never gets told to add indexes.
 */

const MIN_ROWS_FOR_SCAN_ADVICE = 10_000;
const MIN_SEQ_SCANS = 100;
const SEQ_TO_IDX_RATIO = 0.5; // seq scans are > 50% of all scans
const DEAD_TUPLE_RATIO = 0.2;
const MIN_DEAD_TUPLES = 1_000;
const UNUSED_INDEX_MIN_BYTES = 1024 * 1024; // 1 MiB
const LOW_CACHE_HIT = 0.95;
const STALE_ANALYZE_DAYS = 7;

export interface AdvisorInput {
  tables: TableStat[];
  indexes: IndexStat[];
  cacheHitRatio: number | null;
  connections: { active: number; idle: number; max: number };
  now?: Date;
}

function ident(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

function qualified(schema: string, name: string): string {
  return `${ident(schema)}.${ident(name)}`;
}

export function computeSuggestions(input: AdvisorInput): Suggestion[] {
  const out: Suggestion[] = [];
  const now = input.now ?? new Date();

  // 1. Sequential scans dominating large tables → missing index.
  for (const t of input.tables) {
    const totalScans = t.seqScan + t.idxScan;
    if (
      t.estimatedRows >= MIN_ROWS_FOR_SCAN_ADVICE &&
      t.seqScan >= MIN_SEQ_SCANS &&
      totalScans > 0 &&
      t.seqScan / totalScans > SEQ_TO_IDX_RATIO
    ) {
      const pct = Math.round((t.seqScan / totalScans) * 100);
      out.push({
        id: `seqscan:${t.schema}.${t.name}`,
        severity: t.estimatedRows >= 1_000_000 ? "critical" : "warn",
        title: `${t.name} is mostly read by sequential scan`,
        detail: `${pct}% of ${totalScans.toLocaleString()} scans on ~${t.estimatedRows.toLocaleString()} rows skipped the indexes. Check the WHERE / JOIN columns your app filters on and add an index for the hot one.`,
        sql: `-- Inspect what the planner does for a typical query:\nEXPLAIN (ANALYZE, BUFFERS) SELECT * FROM ${qualified(t.schema, t.name)} WHERE <column> = <value>;`,
      });
    }
  }

  // 2. Dead tuple bloat → vacuum.
  for (const t of input.tables) {
    const live = Math.max(t.liveTuples, 1);
    const ratio = t.deadTuples / (live + t.deadTuples);
    if (t.deadTuples >= MIN_DEAD_TUPLES && ratio >= DEAD_TUPLE_RATIO) {
      out.push({
        id: `bloat:${t.schema}.${t.name}`,
        severity: ratio >= 0.5 ? "warn" : "info",
        title: `${t.name} carries ${Math.round(ratio * 100)}% dead tuples`,
        detail: `${t.deadTuples.toLocaleString()} dead rows vs ${t.liveTuples.toLocaleString()} live. Autovacuum may be lagging behind an UPDATE/DELETE-heavy workload.`,
        sql: `VACUUM (ANALYZE) ${qualified(t.schema, t.name)};`,
      });
    }
  }

  // 3. Unused, non-constraint indexes → drop candidates.
  for (const ix of input.indexes) {
    if (ix.scans === 0 && !ix.isPrimary && !ix.isUnique && ix.bytes >= UNUSED_INDEX_MIN_BYTES) {
      out.push({
        id: `unused-index:${ix.schema}.${ix.name}`,
        severity: "info",
        title: `Index ${ix.name} has never been used`,
        detail: `${formatBytes(ix.bytes)} on ${ix.table}, zero scans since statistics were last reset. Every write pays to maintain it. Confirm on a replica before dropping.`,
        sql: `DROP INDEX CONCURRENTLY IF EXISTS ${qualified(ix.schema, ix.name)};`,
      });
    }
  }

  // 4. Stale statistics on big tables.
  for (const t of input.tables) {
    if (t.estimatedRows < MIN_ROWS_FOR_SCAN_ADVICE) continue;
    const last = [t.lastAnalyze, t.lastAutoanalyze]
      .filter((v): v is string => !!v)
      .map((v) => new Date(v).getTime())
      .sort((a, b) => b - a)[0];
    const ageDays = last ? (now.getTime() - last) / 86_400_000 : Infinity;
    if (ageDays > STALE_ANALYZE_DAYS) {
      out.push({
        id: `stale-stats:${t.schema}.${t.name}`,
        severity: "info",
        title: `${t.name} has not been analyzed ${last ? `in ${Math.floor(ageDays)} days` : "yet"}`,
        detail: "The planner is choosing plans from old row estimates. Cheap to fix.",
        sql: `ANALYZE ${qualified(t.schema, t.name)};`,
      });
    }
  }

  // 5. Cache hit ratio.
  if (input.cacheHitRatio !== null && input.cacheHitRatio < LOW_CACHE_HIT) {
    out.push({
      id: "cache-hit",
      severity: input.cacheHitRatio < 0.9 ? "warn" : "info",
      title: `Buffer cache hit ratio is ${(input.cacheHitRatio * 100).toFixed(1)}%`,
      detail:
        "Below ~95% the working set no longer fits in shared_buffers and reads spill to disk. A bigger compute tier, or trimming the hot tables, usually fixes it.",
    });
  }

  // 6. Connection pressure.
  const used = input.connections.active + input.connections.idle;
  if (input.connections.max > 0 && used / input.connections.max >= 0.8) {
    out.push({
      id: "connections",
      severity: used / input.connections.max >= 0.95 ? "critical" : "warn",
      title: `${used} of ${input.connections.max} connection slots in use`,
      detail:
        "Serverless / edge clients that open a connection per request exhaust this fast. Route them through the Supabase pooler (port 6543, transaction mode).",
    });
  }

  const rank: Record<Suggestion["severity"], number> = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value >= 10 ? 0 : 1)} ${UNITS[unit]}`;
}
