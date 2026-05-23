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
  openBaseClient,
  openTargetClient,
  withTargetLock,
} from "./safety";
import { tableIdent } from "./sql-util";

const TX_STATEMENT_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunHooks {
  onPhase?(phase: SyncRunPhase, detail?: string): void;
  onTableStart?(qualified: string, estimatedRows: number): void;
  onTableDone?(qualified: string, rowsCopied: number, durationMs: number): void;
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

    const syncedSet = new Set(plan.order);

    await withTargetLock(targetSql, target.id, async () => {
      // Schema apply (pre-copy): runs in autocommit BEFORE the data
      // transaction. Enum ADD VALUE can't be used in the same transaction it's
      // created in, and CREATE TABLE/TYPE should persist regardless of the data
      // load. All statements are idempotent (IF NOT EXISTS), so a re-run is safe.
      if (options.applySchema && plan.schemaDiff.hasChanges) {
        hooks?.onPhase?.("schema_apply");
        for (const stmt of [...plan.schemaDiff.preCopy, ...plan.schemaDiff.destructive]) {
          await targetSql.unsafe(stmt);
        }
      }

      await targetSql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${TX_STATEMENT_TIMEOUT_MS}`);
        // Defer deferrable FKs so within-set ordering edge cases (incl. some
        // self-references) are checked at COMMIT instead of per row.
        await tx.unsafe("SET CONSTRAINTS ALL DEFERRED");

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

    hooks?.onPhase?.("done");
    return { status: "succeeded", plan, stats };
  } finally {
    await Promise.allSettled([baseSql.end({ timeout: 5 }), targetSql.end({ timeout: 5 })]);
  }
}
