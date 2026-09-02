import { describe, expect, it } from "vitest";
import { computeSuggestions, formatBytes } from "@/lib/performance/advisor";
import type { IndexStat, TableStat } from "@/lib/performance/types";

function table(overrides: Partial<TableStat>): TableStat {
  return {
    schema: "public",
    name: "orders",
    totalBytes: 0,
    tableBytes: 0,
    indexBytes: 0,
    estimatedRows: 0,
    seqScan: 0,
    seqTupRead: 0,
    idxScan: 0,
    liveTuples: 0,
    deadTuples: 0,
    lastVacuum: null,
    lastAutovacuum: null,
    lastAnalyze: new Date().toISOString(),
    lastAutoanalyze: null,
    ...overrides,
  };
}

const quiet = { indexes: [] as IndexStat[], cacheHitRatio: 0.99, connections: { active: 1, idle: 1, max: 60 } };

describe("computeSuggestions", () => {
  it("stays silent for a small healthy project", () => {
    const out = computeSuggestions({ ...quiet, tables: [table({ estimatedRows: 50, seqScan: 500 })] });
    expect(out).toEqual([]);
  });

  it("flags seq-scan-heavy big tables and escalates past a million rows", () => {
    const warn = computeSuggestions({
      ...quiet,
      tables: [table({ estimatedRows: 50_000, seqScan: 900, idxScan: 100 })],
    });
    expect(warn[0]).toMatchObject({ id: "seqscan:public.orders", severity: "warn" });
    expect(warn[0]!.sql).toContain("EXPLAIN (ANALYZE, BUFFERS)");

    const crit = computeSuggestions({
      ...quiet,
      tables: [table({ estimatedRows: 2_000_000, seqScan: 900, idxScan: 100 })],
    });
    expect(crit[0]!.severity).toBe("critical");
  });

  it("does not flag tables whose scans are mostly indexed", () => {
    const out = computeSuggestions({
      ...quiet,
      tables: [table({ estimatedRows: 50_000, seqScan: 200, idxScan: 5_000 })],
    });
    expect(out.find((s) => s.id.startsWith("seqscan:"))).toBeUndefined();
  });

  it("recommends VACUUM when dead tuples pile up", () => {
    const out = computeSuggestions({ ...quiet, tables: [table({ liveTuples: 1_000, deadTuples: 3_000 })] });
    expect(out[0]).toMatchObject({ id: "bloat:public.orders", severity: "warn" });
    expect(out[0]!.sql).toBe("VACUUM (ANALYZE) public.orders;");
  });

  it("suggests dropping large unused non-constraint indexes only", () => {
    const base: IndexStat = { schema: "public", table: "orders", name: "orders_status_idx", bytes: 5 * 1024 * 1024, scans: 0, isUnique: false, isPrimary: false, definition: "" };
    const out = computeSuggestions({
      ...quiet,
      tables: [],
      indexes: [
        base,
        { ...base, name: "orders_pkey", isPrimary: true },
        { ...base, name: "orders_email_key", isUnique: true },
        { ...base, name: "tiny_idx", bytes: 10 },
        { ...base, name: "used_idx", scans: 5 },
      ],
    });
    expect(out.map((s) => s.id)).toEqual(["unused-index:public.orders_status_idx"]);
    expect(out[0]!.sql).toBe("DROP INDEX CONCURRENTLY IF EXISTS public.orders_status_idx;");
  });

  it("quotes identifiers that need it", () => {
    const out = computeSuggestions({
      ...quiet,
      tables: [table({ name: "Order Items", liveTuples: 100, deadTuples: 5_000 })],
    });
    expect(out[0]!.sql).toBe('VACUUM (ANALYZE) public."Order Items";');
  });

  it("flags stale statistics on big tables", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const out = computeSuggestions({
      ...quiet,
      tables: [table({ estimatedRows: 20_000, lastAnalyze: old, lastAutoanalyze: null })],
    });
    expect(out[0]).toMatchObject({ id: "stale-stats:public.orders", severity: "info" });
    expect(out[0]!.title).toContain("in 30 days");
  });

  it("reports cache and connection pressure, ordered by severity", () => {
    const out = computeSuggestions({
      tables: [],
      indexes: [],
      cacheHitRatio: 0.85,
      connections: { active: 50, idle: 8, max: 60 },
    });
    expect(out.map((s) => s.id)).toEqual(["connections", "cache-hit"]);
    expect(out[0]!.severity).toBe("critical");
    expect(out[1]!.severity).toBe("warn");
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatBytes(3.25 * 1024 ** 3)).toBe("3.3 GB");
    expect(formatBytes(-1)).toBe("0 B");
  });
});
