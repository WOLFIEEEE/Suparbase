import type { Table } from "@/lib/types/schema";
import type { TableAnalysis, TableCategory } from "@/lib/types/analysis";
import { pickPreset, findAnalysis } from "./pick";

export interface ArchetypeGroups {
  users: Table[];
  content: Table[];
  logs: Table[];
  generic: Table[];
  /** Tables in the `auth` or `storage` schemas — hidden by default behind a disclosure. */
  system: Table[];
}

export function isSystemTable(table: Table): boolean {
  return table.schema === "auth" || table.schema === "storage";
}

export function categoryOf(
  table: Table,
  analyses: TableAnalysis[] | undefined,
): TableCategory {
  return pickPreset(table, findAnalysis(analyses, table));
}

/**
 * Group an entire schema's tables into archetype buckets using the AI analysis
 * (with heuristic fallback). System tables live in their own bucket; everything
 * else falls into users/content/logs/generic.
 */
export function groupTablesByArchetype(
  tables: Table[],
  analyses: TableAnalysis[] | undefined,
): ArchetypeGroups {
  const out: ArchetypeGroups = {
    users: [],
    content: [],
    logs: [],
    generic: [],
    system: [],
  };
  for (const t of tables) {
    if (isSystemTable(t)) {
      out.system.push(t);
      continue;
    }
    out[categoryOf(t, analyses)].push(t);
  }
  return out;
}

/** Friendly display labels for each archetype bucket. */
export const ARCHETYPE_LABEL: Record<TableCategory | "system", string> = {
  users: "People",
  content: "Library",
  logs: "Activity",
  generic: "Everything else",
  system: "System tables",
};

/** One-line subtitles for each archetype section. */
export const ARCHETYPE_HINT: Record<TableCategory | "system", string> = {
  users: "Accounts, profiles, members",
  content: "Posts, articles, documents",
  logs: "Events, audit trails, activity",
  generic: "Tables that don't fit a clean archetype",
  system: "Postgres / Supabase internals",
};
