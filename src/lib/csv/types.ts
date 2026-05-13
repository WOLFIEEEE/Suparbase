export interface PreviewRow {
  /** 1-based line number in the source file. */
  line: number;
  raw: Record<string, string>;
  coerced: Record<string, unknown> | null; // null when any cell failed coercion
  cellErrors: Record<string, string>;      // column → error message
}

/** Source column header → target table column name OR "__ignore". */
export type ColumnMap = Record<string, string>;

export const IGNORE_COL = "__ignore" as const;

export interface RowError {
  index: number;          // position in the chunk's rows array (0-based)
  line?: number;          // source file line, if known
  column?: string;
  reason: string;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  errors: RowError[];
}

export type ImportPhase =
  | { kind: "idle" }
  | { kind: "previewing"; rows: PreviewRow[]; mapping: ColumnMap }
  | { kind: "importing"; total: number; done: number; errors: RowError[] }
  | { kind: "done"; summary: ImportSummary }
  | { kind: "error"; message: string };

/** Wire shape of a single import chunk (matches contracts/import.md). */
export interface ImportChunkRequest {
  rows: Record<string, unknown>[];
  onError: "skip" | "abort";
}

export interface ImportChunkResponse {
  imported: number;
  skipped: number;
  errors: RowError[];
}
