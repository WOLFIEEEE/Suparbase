import type { Table } from "@/lib/types/schema";
import type { TableAnalysis, TableCategory } from "@/lib/types/analysis";
import { heuristicCategory } from "./heuristic";

export type PresetId = TableCategory;

export function pickPreset(
  table: Table,
  analysis: TableAnalysis | undefined,
  override: PresetId | null = null,
): PresetId {
  if (override) return override;
  if (analysis) return analysis.category;
  return heuristicCategory(table);
}

export function findAnalysis(
  analyses: TableAnalysis[] | undefined,
  table: Pick<Table, "schema" | "name">,
): TableAnalysis | undefined {
  return analyses?.find((a) => a.schema === table.schema && a.name === table.name);
}
