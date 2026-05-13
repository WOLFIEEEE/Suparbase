export type FilterOperator =
  | "eq"
  | "neq"
  | "like"
  | "ilike"
  | "is_null"
  | "not_null"
  | "in"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export interface ChipSpec {
  column: string;
  op: FilterOperator;
  /** null for is_null / not_null; string[] for `in`; string otherwise. */
  value: string | string[] | null;
}
