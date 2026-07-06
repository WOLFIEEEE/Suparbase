import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import type {
  SyncOptions,
  SyncRunPhase,
  SyncRunStats,
  SyncRunStatus,
  SyncTableConfig,
} from "@/server/schema/sync";
import { introspectCatalog } from "./catalog";
import { buildSyncPlan, planForTable } from "./plan";
import type { SyncPlan } from "./plan";
import { copyTable } from "./data-copy";
import { resetSequences } from "./sequences";
import {
  assertDistinctDatabases,
  assertDistinctLive,
  openBaseClient,
  openTargetClient,
  withTargetLock,
} from "./safety";
import { tableIdent } from "./sql-util";

const TX_STATEMENT_TIMEOUT_MS = 30 * 60 * 1000;

/** Thrown to roll back the data transaction when a run is cancelled. */
export class SyncAbortedError extends Error {
  constructor() {
    super("Sync aborted.");
    this.name = "SyncAbortedError";
  }
}

export interface RunHooks {
  onPhase?(phase: SyncRunPhase, detail?: string): void;
  onTableStart?(qualified: string, estimatedRows: number): void;
  onTableDone?(qualified: string, rowsCopied: number, durationMs: number): void;
  onTableVerified?(qualified: string, verifiedRows: number): void;
  onWarning?(message: string): void;
}

export interface RunParams {
  base: ConnectionRow;
  target: ConnectionRow;
  tableConfig: SyncTableConfig;
  options: SyncOptions;
  /** Schemas to introspect/sync. Defaults to public. */
  schemas?: string[];
  dryRun: boolean;
  hooks?: RunHooks;
  /** Cooperative cancellation: checked before each table copy. */
  shouldAbort?: () => Promise<boolean>;
}

export interface RunResult {
  status: SyncRunStatus;
  plan: SyncPlan;
  stats: SyncRunStats;
  error?: string;
}

/**
 * Execute (or dry-run) a sync. The whole data load runs inside ONE target
 * transaction: if any table fails, the transaction rolls back and the target
 * is left exactly as it was. The base is read through a forced-read-only
 * session (`safety.openBaseClient`).
 */
export async function executeSyncRun(params: RunParams): Promise<RunResult> {
  const { base, target, tableConfig, options, dryRun, hooks } = params;
  const schemas = params.schemas ?? ["public"];

  assertDistinctDatabases(base, target);

  const baseSql = openBaseClient(base);
  const targetSql = openTargetClient(target);

  const stats: SyncRunStats = { tables: [], warnings: [] };

  try {
    hooks?.onPhase?.("introspect");
    const [baseCatalog, targetCatalog] = await Promise.all([
      introspectCatalog(baseSql, schemas),
      introspectCatalog(targetSql, schemas),
    ]);

    hooks?.onPhase?.("schema_diff");
    const plan = buildSyncPlan({ base: baseCatalog, target: targetCatalog, tableConfig, options });
    for (const w of plan.warnings) {
      stats.warnings.push(w);
      hooks?.onWarning?.(w);
    }

    if (dryRun) {
      hooks?.onPhase?.("done");
      return { status: "succeeded", plan, stats };
    }

    if (plan.blocking) {
      hooks?.onPhase?.("done");
      return {
        status: "failed",
        plan,
        stats,
        error: plan.blockingReasons.join(" "),
      };
    }

    // Stronger self-clobber check now that both sessions are open.
    await assertDistinctLive(baseSql, targetSql);

    const syncedSet = new Set(plan.order);

    try {
      await withTargetLock(targetSql, target.id, async () => {
      // Additive schema apply (pre-copy): runs in autocommit BEFORE the data
      // transaction. Enum ADD VALUE can't be used in the same transaction it's
      // created in, and CREATE TABLE/TYPE/ADD COLUMN should persist regardless
      // of the data load. All statements are idempotent (IF NOT EXISTS), so a
      // re-run is safe and leaving them behind on a failed run is harmless.
      // DESTRUCTIVE DDL is deliberately NOT run here — see inside the tx below.
      if (options.applySchema && plan.schemaDiff.preCopy.length > 0) {
        hooks?.onPhase?.("schema_apply");
        for (const stmt of plan.schemaDiff.preCopy) {
          await targetSql.unsafe(stmt);
        }
      }

      await targetSql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${TX_STATEMENT_TIMEOUT_MS}`);
        // Defer deferrable FKs so within-set ordering edge cases (incl. some
        // self-references) are checked at COMMIT instead of per row.
        await tx.unsafe("SET CONSTRAINTS ALL DEFERRED");

        // Destructive schema changes (DROP TABLE / DROP COLUMN) run INSIDE the
        // data transaction so any later failure rolls them back — a drop is
        // irreversible, so it must be atomic with the load rather than
        // committed up front in autocommit. Runs before TRUNCATE because
        // dropping a target-only table that FKs into a synced table has to
        // happen before that synced table is truncated.
        if (options.applySchema && plan.schemaDiff.destructive.length > 0) {
          hooks?.onPhase?.("schema_apply");
          for (const stmt of plan.schemaDiff.destructive) {
            await tx.unsafe(stmt);
          }
        }

        // Truncate every synced table together so intra-set FKs don't block.
        if (plan.truncateOrder.length > 0) {
          hooks?.onPhase?.("truncate");
          const list = plan.truncateOrder
            .map((q) => {
              const tp = planForTable(plan, q)!;
              return tableIdent(tp.schema, tp.name);
            })
            .join(", ");
          await tx.unsafe(`TRUNCATE ${list}`);
        }

        hooks?.onPhase?.("data_copy");
        for (const qualified of plan.order) {
          if (params.shouldAbort && (await params.shouldAbort())) {
            throw new SyncAbortedError();
          }
          const tablePlan = planForTable(plan, qualified)!;
          hooks?.onTableStart?.(qualified, tablePlan.estimatedRows);
          const t0 = Date.now();
          const rowsCopied = await copyTable(baseSql, tx, tablePlan);
          const durationMs = Date.now() - t0;
          stats.tables.push({ table: qualified, rowsCopied, durationMs });
          hooks?.onTableDone?.(qualified, rowsCopied, durationMs);
        }

        hooks?.onPhase?.("sequences");
        const seqWarnings = await resetSequences(tx, syncedSet, schemas);
        for (const w of seqWarnings) {
          stats.warnings.push(w);
          hooks?.onWarning?.(w);
        }

        // Verify: count(*) each loaded table on the target and compare to what
        // COPY reported loading. A mismatch means a trigger (which can't be
        // disabled on Supabase's non-superuser role) mutated the row set during
        // the load — the run is still atomic, but the target is NOT an exact
        // mirror, so we surface it as a warning and downgrade to `partial`.
        hooks?.onPhase?.("verify");
        for (const stat of stats.tables) {
          const tablePlan = planForTable(plan, stat.table);
          if (!tablePlan) continue;
          try {
            const ident = tableIdent(tablePlan.schema, tablePlan.name);
            const [{ n }] = await tx.unsafe<{ n: string }[]>(
              `SELECT count(*)::text AS n FROM ${ident}`,
            );
            const verifiedRows = Number(n);
            stat.verifiedRows = verifiedRows;
            hooks?.onTableVerified?.(stat.table, verifiedRows);
            if (verifiedRows !== stat.rowsCopied) {
              const w = `Verification mismatch on ${stat.table}: loaded ${stat.rowsCopied} row(s) but the target now holds ${verifiedRows} (a trigger likely fired during the copy).`;
              stats.warnings.push(w);
              hooks?.onWarning?.(w);
            }
          } catch (e) {
            const w = `Could not verify row count for ${stat.table}: ${(e as Error).message}`;
            stats.warnings.push(w);
            hooks?.onWarning?.(w);
          }
        }

        // Schema apply (post-copy): SET NOT NULL, ADD CONSTRAINT (unique/check/
        // fk), CREATE INDEX — inside the data transaction so the just-loaded
        // rows are validated against them atomically.
        if (options.applySchema && plan.schemaDiff.postCopy.length > 0) {
          hooks?.onPhase?.("schema_apply");
          for (const stmt of plan.schemaDiff.postCopy) {
            await tx.unsafe(stmt);
          }
        }
        });
      });
    } catch (e) {
      // A cancelled run rolls back the transaction (target untouched) and
      // finishes cleanly with an `aborted` status rather than a hard error.
      if (e instanceof SyncAbortedError) {
        hooks?.onPhase?.("done");
        return { status: "aborted", plan, stats };
      }
      throw e;
    }

    hooks?.onPhase?.("done");
    // A verification mismatch means the load committed but the target isn't an
    // exact mirror — report `partial` so a green "succeeded" can't hide it.
    const hadMismatch = stats.tables.some(
      (t) => t.verifiedRows != null && t.verifiedRows !== t.rowsCopied,
    );
    return { status: hadMismatch ? "partial" : "succeeded", plan, stats };
  } finally {
    await Promise.allSettled([baseSql.end({ timeout: 5 }), targetSql.end({ timeout: 5 })]);
  }
}
