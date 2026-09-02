/**
 * Shapes returned by GET /api/v/[id]/performance and consumed by the
 * Performance page + the pure advisor. Numbers are plain JS numbers (bigint
 * counts are coerced server-side) so they serialise cleanly.
 */

export interface TableStat {
  schema: string;
  name: string;
  /** pg_total_relation_size, bytes (table + indexes + toast). */
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  /** Planner estimate from pg_class.reltuples (never a COUNT(*)). */
  estimatedRows: number;
  seqScan: number;
  seqTupRead: number;
  idxScan: number;
  liveTuples: number;
  deadTuples: number;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
}

export interface IndexStat {
  schema: string;
  table: string;
  name: string;
  bytes: number;
  scans: number;
  isUnique: boolean;
  isPrimary: boolean;
  definition: string;
}

export interface StatementStat {
  query: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  rows: number;
}

export interface ExtensionInfo {
  name: string;
  version: string;
}

export interface PerformanceReport {
  collectedAt: string;
  databaseBytes: number;
  /** Buffer cache hit ratio 0..1 across the database, null if no stats yet. */
  cacheHitRatio: number | null;
  /** Index hit ratio 0..1, null if no index reads yet. */
  indexHitRatio: number | null;
  connections: { active: number; idle: number; max: number };
  tables: TableStat[];
  indexes: IndexStat[];
  /** Top statements by total time; empty when pg_stat_statements is unavailable. */
  statements: StatementStat[];
  hasStatStatements: boolean;
  extensions: ExtensionInfo[];
  /** Pre-computed advice from the pure advisor. */
  suggestions: Suggestion[];
}

export type SuggestionSeverity = "critical" | "warn" | "info";

export interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  /** Optional copy-paste SQL to act on it. */
  sql?: string;
}
