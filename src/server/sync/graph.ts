import "server-only";
import type { DbCatalog, TableMeta } from "./catalog";
import { NEVER_SYNC_SCHEMAS, qualify } from "./catalog";
import type { TableAction } from "@/server/schema/sync";

/**
 * FK dependency analysis for a sync run.
 *
 * Two questions this answers:
 *
 *  1. **Copy order** — a child row can't be inserted before the parent row
 *     it references exists. So `sync` tables are inserted parents-first
 *     (topological order) and truncated children-first (the reverse).
 *
 *  2. **At-risk FKs** — a `sync` table whose FK points at a parent that is
 *     NOT being synced with the same row set (an `exclude`/`skip` table, or
 *     a never-synced schema like `auth`) will carry base's FK values into a
 *     target where those rows don't exist. Those columns must be resolved
 *     (null-out or remap). A `sync`→`sync` FK is always safe because the
 *     parent receives base's exact primary keys.
 */

export type ParentAction = TableAction | "never_sync";

export interface FkRisk {
  /** Qualified `schema.table` of the synced child. */
  table: string;
  fkName: string;
  /** Local FK columns on the child. */
  columns: string[];
  /** Qualified `schema.table` of the parent. */
  refTable: string;
  /** Why the parent's rows won't be present in the target. */
  refAction: ParentAction;
}

export interface TopoResult {
  /** `sync` tables, parents before children. Truncate in reverse. */
  order: string[];
  /** Groups of qualified tables that form FK cycles (can't be ordered). */
  cycles: string[][];
  /** `sync` tables with a foreign key to themselves. */
  selfReferential: string[];
}

function parentQualified(fkRefSchema: string, fkRefTable: string): string {
  return qualify(fkRefSchema, fkRefTable);
}

/**
 * Compute the parents-first insert order for the set of `sync` tables.
 * Only FK edges between two synced tables constrain the order — edges to
 * excluded/skipped/never-synced parents are handled by FK resolution, not
 * ordering, so they're ignored here.
 */
export function topoSyncOrder(
  catalog: DbCatalog,
  isSynced: (qualified: string) => boolean,
): TopoResult {
  const byQualified = new Map<string, TableMeta>();
  for (const t of catalog.tables) byQualified.set(t.qualified, t);

  const nodes = catalog.tables
    .map((t) => t.qualified)
    .filter((q) => isSynced(q))
    .sort();

  const nodeSet = new Set(nodes);

  // dependsOn[child] = set of synced parents the child references.
  const dependsOn = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const selfReferential = new Set<string>();
  for (const q of nodes) {
    dependsOn.set(q, new Set());
    dependents.set(q, new Set());
  }

  for (const q of nodes) {
    const table = byQualified.get(q)!;
    for (const fk of table.foreignKeys) {
      const parent = parentQualified(fk.refSchema, fk.refTable);
      if (parent === q) {
        selfReferential.add(q);
        continue; // self-reference doesn't constrain table-level ordering
      }
      if (!nodeSet.has(parent)) continue; // parent not synced → not an ordering edge
      dependsOn.get(q)!.add(parent);
      dependents.get(parent)!.add(q);
    }
  }

  // Kahn's algorithm. Process nodes with no remaining unsatisfied parent.
  const indegree = new Map<string, number>();
  for (const q of nodes) indegree.set(q, dependsOn.get(q)!.size);

  const ready = nodes.filter((q) => indegree.get(q) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const q = ready.shift()!;
    order.push(q);
    for (const child of [...dependents.get(q)!].sort()) {
      const next = indegree.get(child)! - 1;
      indegree.set(child, next);
      if (next === 0) {
        // keep `ready` sorted for deterministic output
        const idx = ready.findIndex((r) => r > child);
        if (idx === -1) ready.push(child);
        else ready.splice(idx, 0, child);
      }
    }
  }

  // Anything left has indegree > 0 → part of a cycle.
  const remaining = nodes.filter((q) => !order.includes(q));
  const cycles = remaining.length > 0 ? extractCycles(remaining, dependsOn) : [];

  return { order, cycles, selfReferential: [...selfReferential].sort() };
}

/** Group the leftover nodes into connected components (the cyclic clusters). */
function extractCycles(
  remaining: string[],
  dependsOn: Map<string, Set<string>>,
): string[][] {
  const remainingSet = new Set(remaining);
  const seen = new Set<string>();
  const groups: string[][] = [];

  for (const start of remaining) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const q = stack.pop()!;
      if (seen.has(q)) continue;
      seen.add(q);
      group.push(q);
      // walk both directions within the remaining (cyclic) subgraph
      for (const parent of dependsOn.get(q) ?? []) {
        if (remainingSet.has(parent) && !seen.has(parent)) stack.push(parent);
      }
      for (const other of remaining) {
        if (!seen.has(other) && (dependsOn.get(other)?.has(q) ?? false)) {
          stack.push(other);
        }
      }
    }
    groups.push(group.sort());
  }
  return groups;
}

/**
 * Find every FK on a `sync` table that points at a parent which won't hold
 * base's rows in the target. These are the columns the user must resolve
 * (null-out or remap) in the sync profile.
 */
export function atRiskForeignKeys(
  catalog: DbCatalog,
  actionFor: (qualified: string) => TableAction,
): FkRisk[] {
  const present = new Set(catalog.tables.map((t) => t.qualified));
  const risks: FkRisk[] = [];

  for (const table of catalog.tables) {
    if (actionFor(table.qualified) !== "sync") continue;

    for (const fk of table.foreignKeys) {
      const parent = parentQualified(fk.refSchema, fk.refTable);
      if (parent === table.qualified) continue; // self-ref is safe under sync

      let refAction: ParentAction;
      if (NEVER_SYNC_SCHEMAS.includes(fk.refSchema) || !present.has(parent)) {
        refAction = "never_sync";
      } else {
        refAction = actionFor(parent);
      }

      if (refAction === "sync") continue; // parent gets base's exact PKs → safe

      risks.push({
        table: table.qualified,
        fkName: fk.name,
        columns: fk.columns,
        refTable: parent,
        refAction,
      });
    }
  }
  return risks;
}
