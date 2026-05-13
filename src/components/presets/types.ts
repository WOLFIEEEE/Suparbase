import type { Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

export interface PresetProps {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
}
