import "server-only";
import type { DbCatalog, TableMeta } from "./catalog";
import { insertableColumns } from "./catalog";
import { atRiskForeignKeys, topoSyncOrder } from "./graph";
import type { FkRisk } from "./graph";
import { computeSchemaDiff } from "./schema-diff";
import type { SchemaDiff } from "./schema-diff";
import type { SyncOptions, SyncTableConfig, TableAction } from "@/server/schema/sync";

/**
 * The plan is what a dry-run returns and what the runner executes. It's
 * computed purely from the two catalogs + the profile config — no writes.
 * `blocking` (with reasons) means a real run must not proceed.
 */

export interface FkTransform {
  column: string;
  strategy: "null" | "remap";
  remapTo?: string;
  /** Postgres type to cast the NULL / literal to in the base projection. */
  castType: string;
}

export interface AnonTransform {
  column: string;
  strategy: "null" | "fixed" | "hash" | "email";
  value?: string;
  castType: string;
}

export interface TablePlan {
  qualified: string;
  schema: string;
  name: string;
  action: TableAction;
  /** Base row estimate (reltuples). */
  estimatedRows: number;
  /** Columns copied, in base order, excluding generated (stored) columns. */
  columns: string[];
  transforms: FkTransform[];
  anonymize: AnonTransform[];
  existsInTarget: boolean;
  /** Copyable base columns missing on the target. */
  missingInTarget: string[];
  /** Target columns the copy won't populate (informational). */
  extraInTarget: string[];
  rowCap: number | null;
}

export interface SyncPlan {
  /** `sync` tables, parents-first (copy order). */
  order: string[];
  /** Reverse of `order` (truncate order). */
  truncateOrder: string[];
  tables: TablePlan[];
  excluded: string[];
  skipped: string[];
  cycles: string[][];
  selfReferential: string[];
  unresolvedRisks: FkRisk[];
  schemaMismatches: string[];
  /** Structural DDL the run will apply when options.applySchema is on. */
  schemaDiff: SchemaDiff;
  warnings: string[];
  blocking: boolean;
  blockingReasons: string[];
}

export interface PlanInput {
  base: DbCatalog;
  target: DbCatalog;
  tableConfig: SyncTableConfig;
  options: SyncOptions;
}

function actionFor(config: SyncTableConfig, qualified: string): TableAction {
  return config.tables[qualified]?.action ?? "sync";
}

export function buildSyncPlan(input: PlanInput): SyncPlan {
  const { base, target, tableConfig, options } = input;

  const targetByQualified = new Map<string, TableMeta>();
  for (const t of target.tables) targetByQualified.set(t.qualified, t);

  const isSynced = (q: string) => actionFor(tableConfig, q) === "sync";

  const topo = topoSyncOrder(base, isSynced);
  const risks = atRiskForeignKeys(base, (q) => actionFor(tableConfig, q));

  // Index risks by table → resolved transforms + unresolved.
  const transformsByTable = new Map<string, FkTransform[]>();
  const unresolvedRisks: FkRisk[] = [];
  const blockingReasons: string[] = [];

  for (const risk of risks) {
    const baseTable = base.tables.find((t) => t.qualified === risk.table)!;
    const ruleFk = tableConfig.tables[risk.table]?.fk ?? {};
    const resolvedHere: FkTransform[] = [];
    let allResolved = true;

    for (const col of risk.columns) {
      const res = ruleFk[col];
      if (!res) {
        allResolved = false;
        continue;
      }
      const colMeta = baseTable.columns.find((c) => c.name === col);
      const castType = colMeta?.dataType ?? "text";
      if (res.strategy === "null" && colMeta?.notNull) {
        blockingReasons.push(
          `${risk.table}.${col} is NOT NULL but its FK resolution is "null".`,
        );
      }
      if (res.strategy === "remap" && !res.remapTo) {
        blockingReasons.push(
          `${risk.table}.${col} resolution is "remap" but no target value was given.`,
        );
      }
      resolvedHere.push({
        column: col,
        strategy: res.strategy,
        remapTo: res.remapTo,
        castType,
      });
    }

    if (!allResolved) {
      unresolvedRisks.push(risk);
    } else {
      const existing = transformsByTable.get(risk.table) ?? [];
      transformsByTable.set(risk.table, dedupeTransforms([...existing, ...resolvedHere]));
    }
  }

  // Build per-table plans for the sync set.
  const schemaMismatches: string[] = [];
  const warnings: string[] = [];
  const tables: TablePlan[] = [];

  for (const t of base.tables) {
    const action = actionFor(tableConfig, t.qualified);
    if (action !== "sync") continue;

    const targetTable = targetByQualified.get(t.qualified);
    const copyCols = insertableColumns(t).map((c) => c.name);

    // Anonymization rules → transforms (validated against column type).
    const anonRules = tableConfig.tables[t.qualified]?.anonymize ?? {};
    const anonymize: AnonTransform[] = [];
    for (const [col, rule] of Object.entries(anonRules)) {
      const colMeta = t.columns.find((c) => c.name === col);
      if (!colMeta) {
        // A rule pointing at a column that no longer exists must block, not
        // silently skip: the user configured this column to be anonymized,
        // and copying without the rule could leak the data it was hiding.
        blockingReasons.push(
          `${t.qualified}.${col} has an anonymization rule but the column does not exist on the base. Remove or update the rule.`,
        );
        continue;
      }
      const castType = colMeta.dataType;
      if (rule.strategy === "null" && colMeta.notNull) {
        blockingReasons.push(`${t.qualified}.${col} is NOT NULL but its anonymization is "null".`);
      }
      if ((rule.strategy === "hash" || rule.strategy === "email") && !isTextual(castType)) {
        blockingReasons.push(
          `${t.qualified}.${col}: "${rule.strategy}" anonymization needs a text column (is ${castType}).`,
        );
      }
      anonymize.push({ column: col, strategy: rule.strategy, value: rule.value, castType });
    }

    let missingInTarget: string[] = [];
    let extraInTarget: string[] = [];
    if (!targetTable) {
      schemaMismatches.push(`Table ${t.qualified} does not exist on the target.`);
    } else {
      const targetColNames = new Set(targetTable.columns.map((c) => c.name));
      missingInTarget = copyCols.filter((c) => !targetColNames.has(c));
      const baseColNames = new Set(t.columns.map((c) => c.name));
      extraInTarget = targetTable.columns
        .filter((c) => !baseColNames.has(c.name) && !c.generated)
        .map((c) => c.name);
      if (missingInTarget.length > 0) {
        schemaMismatches.push(
          `Table ${t.qualified} is missing column(s) on the target: ${missingInTarget.join(", ")}.`,
        );
      }
    }

    tables.push({
      qualified: t.qualified,
      schema: t.schema,
      name: t.name,
      action,
      estimatedRows: t.estimatedRows,
      columns: copyCols,
      transforms: transformsByTable.get(t.qualified) ?? [],
      anonymize,
      existsInTarget: Boolean(targetTable),
      missingInTarget,
      extraInTarget,
      rowCap: options.rowCap,
    });
  }

  // Triggers fire during COPY — Supabase's non-superuser role can't set
  // session_replication_role = replica to suppress them. Warn so the user
  // can confirm they're safe on a bulk full-replace (or drop them first).
  const triggered = base.tables
    .filter((t) => actionFor(tableConfig, t.qualified) === "sync" && t.triggers.length > 0)
    .map((t) => t.qualified);
  if (triggered.length > 0) {
    warnings.push(
      `These synced tables have triggers that will fire during the copy (they can't be disabled on Supabase): ${triggered.join(", ")}. Confirm they're safe on a bulk load, or drop them first.`,
    );
  }

  // A row cap silently truncates large tables; surface which ones so a
  // forgotten test cap can't masquerade as a complete "succeeded" sync.
  if (options.rowCap != null) {
    const capped = tables
      .filter((t) => t.estimatedRows > options.rowCap!)
      .map((t) => t.qualified);
    if (capped.length > 0) {
      warnings.push(
        `Row cap ${options.rowCap} is set: these tables will be truncated to the first ${options.rowCap} rows: ${capped.join(", ")}.`,
      );
    }
  }

  const excluded = base.tables
    .filter((t) => actionFor(tableConfig, t.qualified) === "exclude")
    .map((t) => t.qualified);
  const skipped = base.tables
    .filter((t) => actionFor(tableConfig, t.qualified) === "skip")
    .map((t) => t.qualified);

  if (topo.cycles.length > 0) {
    for (const cycle of topo.cycles) {
      blockingReasons.push(
        `Foreign-key cycle among synced tables (${cycle.join(" ↔ ")}). Exclude or skip one, or split the run.`,
      );
    }
  }
  if (topo.selfReferential.length > 0) {
    warnings.push(
      `Self-referential table(s) ${topo.selfReferential.join(", ")}: rows are loaded with FK checks deferred where possible, but a non-deferrable self-FK may fail. The run is atomic, so a failure leaves the target untouched.`,
    );
  }

  // Schema diff: when applySchema is on, the run aligns the target's
  // structure to base; only unresolvable diffs (type changes, etc.) block.
  // When it's off, any mismatch blocks (data-only assumes schemas match).
  const syncedQualifieds = new Set(
    base.tables.filter((t) => actionFor(tableConfig, t.qualified) === "sync").map((t) => t.qualified),
  );
  const schemaDiff = computeSchemaDiff(base, target, syncedQualifieds, options);

  if (!options.applySchema && schemaMismatches.length > 0) {
    blockingReasons.push(
      "Target schema does not match base. Turn on schema sync to apply the structural changes, or fix the target.",
    );
  }
  if (options.applySchema) {
    for (const b of schemaDiff.blockers) blockingReasons.push(b);
    for (const w of schemaDiff.warnings) warnings.push(w);
  }
  if (unresolvedRisks.length > 0) {
    blockingReasons.push(
      `${unresolvedRisks.length} foreign key(s) point at excluded/unsynced tables and need a resolution (null or remap).`,
    );
  }

  return {
    order: topo.order,
    truncateOrder: [...topo.order].reverse(),
    tables,
    excluded,
    skipped,
    cycles: topo.cycles,
    selfReferential: topo.selfReferential,
    unresolvedRisks,
    schemaMismatches,
    schemaDiff,
    warnings,
    blocking: blockingReasons.length > 0,
    blockingReasons,
  };
}

function isTextual(type: string): boolean {
  return /text|varchar|character varying|citext|char/i.test(type);
}

function dedupeTransforms(list: FkTransform[]): FkTransform[] {
  const byCol = new Map<string, FkTransform>();
  for (const t of list) byCol.set(t.column, t);
  return [...byCol.values()];
}

/** Look up a table plan by qualified name. */
export function planForTable(plan: SyncPlan, qualified: string): TablePlan | undefined {
  return plan.tables.find((t) => t.qualified === qualified);
}
