import "server-only";
import type { DbCatalog, EnumMeta, TableMeta } from "./catalog";
import { NEVER_SYNC_SCHEMAS } from "./catalog";
import type { SyncOptions } from "@/server/schema/sync";
import * as ddl from "./ddl-generate";

/**
 * Diff base vs target catalogs for the set of synced tables and emit the DDL
 * to make the target's structure match base. Split into phases because a data
 * load sits in the middle:
 *
 *   preCopy   — enums, enum values, CREATE TABLE, ADD COLUMN (nullable),
 *               and (gated) destructive drops. Runs before TRUNCATE/COPY.
 *   postCopy  — SET NOT NULL, ADD CONSTRAINT (unique/check/fk), CREATE INDEX.
 *               Runs after data is loaded so the data satisfies them.
 *   destructive — drops, only included when options.allowDestructive.
 *
 * `blockers` are mismatches we can't safely resolve (type changes, an extra
 * NOT NULL target column with no default while destructive drops are off).
 */

export interface SchemaDiffItem {
  kind: string;
  detail: string;
}

export interface SchemaDiff {
  preCopy: string[];
  postCopy: string[];
  destructive: string[];
  summary: SchemaDiffItem[];
  warnings: string[];
  blockers: string[];
  /** True when there's any structural change to apply. */
  hasChanges: boolean;
}

function enumKey(e: { schema: string; name: string }): string {
  return `${e.schema}.${e.name}`;
}

/** Normalize a base type to compare against a target type loosely. */
function typesDiffer(a: string, b: string): boolean {
  return a.trim().toLowerCase() !== b.trim().toLowerCase();
}

export function computeSchemaDiff(
  base: DbCatalog,
  target: DbCatalog,
  syncedQualifieds: Set<string>,
  options: SyncOptions,
): SchemaDiff {
  const preCopy: string[] = [];
  const postCopy: string[] = [];
  const destructive: string[] = [];
  const summary: SchemaDiffItem[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const targetTables = new Map<string, TableMeta>();
  for (const t of target.tables) targetTables.set(t.qualified, t);
  const baseTables = new Map<string, TableMeta>();
  for (const t of base.tables) baseTables.set(t.qualified, t);

  const targetEnums = new Map<string, EnumMeta>();
  for (const e of target.enums) targetEnums.set(enumKey(e), e);

  // --- Enums: create missing, add missing values --------------------------
  for (const e of base.enums) {
    const t = targetEnums.get(enumKey(e));
    if (!t) {
      preCopy.push(ddl.createEnum(e));
      summary.push({ kind: "create_enum", detail: `${enumKey(e)} (${e.values.length} values)` });
    } else {
      const have = new Set(t.values);
      const missing = e.values.filter((v) => !have.has(v));
      for (const v of missing) preCopy.push(ddl.addEnumValue(e, v));
      if (missing.length > 0) {
        summary.push({ kind: "alter_enum", detail: `${enumKey(e)} += ${missing.join(", ")}` });
      }
    }
  }

  // --- Tables -------------------------------------------------------------
  for (const baseTable of base.tables) {
    if (!syncedQualifieds.has(baseTable.qualified)) continue;
    const targetTable = targetTables.get(baseTable.qualified);

    if (!targetTable) {
      // Whole table is missing → create it (cols + inline PK now; other
      // constraints + indexes after the load).
      preCopy.push(ddl.createTable(baseTable));
      summary.push({ kind: "create_table", detail: baseTable.qualified });
      for (const c of baseTable.constraints) {
        if (c.type === "p") continue; // inline already
        postCopy.push(ddl.addConstraint(baseTable, c));
      }
      for (const idx of baseTable.indexes) postCopy.push(ddl.createIndex(idx));
      continue;
    }

    // Existing table → reconcile columns.
    const targetColsByName = new Map(targetTable.columns.map((c) => [c.name, c]));
    const baseColNames = new Set(baseTable.columns.map((c) => c.name));

    for (const col of baseTable.columns) {
      const tcol = targetColsByName.get(col.name);
      if (!tcol) {
        preCopy.push(ddl.addColumn(baseTable, col));
        summary.push({ kind: "add_column", detail: `${baseTable.qualified}.${col.name}` });
        if (col.notNull && !col.generated) postCopy.push(ddl.setNotNull(baseTable, col.name));
        continue;
      }
      if (typesDiffer(col.dataType, tcol.dataType)) {
        blockers.push(
          `${baseTable.qualified}.${col.name}: type differs (base ${col.dataType} / target ${tcol.dataType}). Type changes are not applied automatically.`,
        );
      }
    }

    // Extra target columns not in base.
    for (const tcol of targetTable.columns) {
      if (baseColNames.has(tcol.name)) continue;
      if (options.allowDestructive) {
        destructive.push(ddl.dropColumn(baseTable, tcol.name));
        summary.push({ kind: "drop_column", detail: `${baseTable.qualified}.${tcol.name}` });
      } else if (tcol.notNull && !tcol.hasDefault && !tcol.generated) {
        blockers.push(
          `${baseTable.qualified}.${tcol.name} exists only on the target, is NOT NULL with no default, and destructive changes are off. The copy can't supply it. Enable destructive changes to drop it, or add a default.`,
        );
      } else {
        warnings.push(
          `${baseTable.qualified}.${tcol.name} exists only on the target; copied rows leave it at its default/NULL.`,
        );
      }
    }

    // Add missing constraints (compare by exact def text).
    const targetDefs = new Set(targetTable.constraints.map((c) => c.def.trim()));
    for (const c of baseTable.constraints) {
      if (c.type === "p") continue; // PK changes not handled on existing tables
      if (!targetDefs.has(c.def.trim())) {
        postCopy.push(ddl.addConstraint(baseTable, c));
        summary.push({ kind: "add_constraint", detail: `${baseTable.qualified} ${c.def}` });
      }
    }

    // Add missing indexes (compare by def text).
    const targetIdxDefs = new Set(targetTable.indexes.map((i) => i.def.trim()));
    for (const idx of baseTable.indexes) {
      if (!targetIdxDefs.has(idx.def.trim())) {
        postCopy.push(ddl.createIndex(idx));
        summary.push({ kind: "create_index", detail: idx.name });
      }
    }

    // Indexes on the target that base doesn't have. We don't drop them (an
    // extra index is harmless and may be intentional on staging), but the spec
    // is "objects we don't reconcile are surfaced, not silently ignored", so
    // warn rather than leave the drift invisible.
    const baseIdxDefs = new Set(baseTable.indexes.map((i) => i.def.trim()));
    for (const idx of targetTable.indexes) {
      if (!baseIdxDefs.has(idx.def.trim())) {
        warnings.push(
          `Index ${idx.name} exists on the target ${baseTable.qualified} but not on base; left in place.`,
        );
      }
    }
  }

  // --- Extra target tables (present on target, absent from base) ----------
  for (const t of target.tables) {
    if (NEVER_SYNC_SCHEMAS.includes(t.schema)) continue;
    if (baseTables.has(t.qualified)) continue;
    if (options.allowDestructive) {
      destructive.push(ddl.dropTable(t.schema, t.name));
      summary.push({ kind: "drop_table", detail: t.qualified });
    } else {
      warnings.push(
        `Table ${t.qualified} exists on the target but not on base; left untouched (enable destructive changes to drop it).`,
      );
    }
  }

  return {
    preCopy,
    postCopy,
    destructive,
    summary,
    warnings,
    blockers,
    hasChanges: preCopy.length + postCopy.length + destructive.length > 0,
  };
}
