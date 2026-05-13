export type TableCategory = "users" | "content" | "logs" | "generic";

export interface TableAnalysisPrimary {
  titleColumn?: string | null;
  subtitleColumn?: string | null;
  avatarColumn?: string | null;
  badgeColumn?: string | null;
}

export interface TableAnalysisRelation {
  fkColumn: string;
  label: string;
  showOnDetail: boolean;
}

export interface TableAnalysis {
  schema: string;
  name: string;
  category: TableCategory;
  displayName: string;
  listColumns: string[];
  statusColumn?: string | null;
  titleColumn?: string | null;
  notes?: string;
  primary?: TableAnalysisPrimary;
  hiddenColumns?: string[];
  relations?: TableAnalysisRelation[];
}

export interface SchemaAnalysisResult {
  fingerprint: string;
  source: "ai" | "heuristic";
  model: string;
  tables: TableAnalysis[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishedAt: string;
}

export interface AiSettingsSummary {
  hasKey: boolean;
  defaultModel: string;
  lastAnalysisModel: string | null;
  lastAnalysisAt: string | null;
  lastPromptTokens: number | null;
  lastCompletionTokens: number | null;
  lastTotalTokens: number | null;
}
