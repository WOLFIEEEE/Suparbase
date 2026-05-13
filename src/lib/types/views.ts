import type { ChipSpec } from "@/lib/filters/types";

export interface ViewState {
  search?: string;
  sort?: { column: string; direction: "asc" | "desc" };
  filters: ChipSpec[];
  /** Column-name overrides layered on top of analysis.hiddenColumns. */
  hidden?: string[];
}

export interface SavedView {
  id: string;
  name: string;
  state: ViewState;
  createdAt: string;
  updatedAt: string;
}

/** Convenience re-export for components that consume both. */
export type { ChipSpec };
