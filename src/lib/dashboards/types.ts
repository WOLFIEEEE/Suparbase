export type WidgetType = "kpi" | "bar" | "line" | "list";
export type WidgetSpan = "1" | "2" | "full";

export interface WidgetVisConfig {
  valueColumn?: string;
  format?: "number" | "currency" | "percent";
  unit?: string;
  prefix?: string;
  labelColumn?: string;
  columns?: string[];
}

export interface WidgetSummary {
  id: string;
  type: WidgetType;
  title: string;
  description: string | null;
  sql: string;
  visConfig: WidgetVisConfig;
  position: number;
  span: WidgetSpan;
  refreshSec: number;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetRunResult {
  columns: Array<{ name: string; typeOid: number }>;
  rows: unknown[][];
  rowCount: number;
  elapsedMs: number;
  notices: string[];
}
