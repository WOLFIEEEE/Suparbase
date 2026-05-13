import type { ChipSpec, FilterOperator } from "./types";

/**
 * Map a chip into the PostgREST filter value the proxy will forward.
 * PostgREST's URL convention: `?col=op.value`. Our internal URL stores chips
 * as repeated `filter=col.op.value` params; this function returns the bare
 * `op.value` half for that column.
 *
 * `is_null` and `not_null` carry no value: emit `is.null` / `not.is.null`.
 * `in` accepts a string[] and emits `in.(a,b,c)`.
 */
export function chipToPostgrest(chip: ChipSpec): string {
  switch (chip.op) {
    case "is_null":
      return "is.null";
    case "not_null":
      return "not.is.null";
    case "in": {
      const arr = Array.isArray(chip.value) ? chip.value : [String(chip.value ?? "")];
      const escaped = arr.map((v) => escapePostgrestValue(v)).join(",");
      return `in.(${escaped})`;
    }
    default: {
      const v = Array.isArray(chip.value) ? chip.value.join(",") : String(chip.value ?? "");
      return `${pgOp(chip.op)}.${escapePostgrestValue(v)}`;
    }
  }
}

/** Internal name → PostgREST operator token. */
function pgOp(op: FilterOperator): string {
  switch (op) {
    case "eq":
      return "eq";
    case "neq":
      return "neq";
    case "like":
      // Wrap user's substring in `*` so `like.*foo*` behaves like "contains".
      return "like";
    case "ilike":
      return "ilike";
    case "gt":
      return "gt";
    case "lt":
      return "lt";
    case "gte":
      return "gte";
    case "lte":
      return "lte";
    case "is_null":
    case "not_null":
    case "in":
      // Already handled before this branch.
      return op;
  }
}

/**
 * PostgREST treats `,`, `(`, `)` and `.` specially inside filter values.
 * Wrap in double quotes when one of those appears.
 */
function escapePostgrestValue(value: string): string {
  if (/[,()."]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const OPERATORS_FOR_TYPE: Record<string, FilterOperator[]> = {
  string: ["eq", "neq", "ilike", "like", "is_null", "not_null", "in"],
  text: ["eq", "neq", "ilike", "like", "is_null", "not_null", "in"],
  integer: ["eq", "neq", "gt", "lt", "gte", "lte", "is_null", "not_null", "in"],
  float: ["eq", "neq", "gt", "lt", "gte", "lte", "is_null", "not_null"],
  boolean: ["eq", "neq", "is_null", "not_null"],
  date: ["eq", "neq", "gt", "lt", "gte", "lte", "is_null", "not_null"],
  datetime: ["eq", "neq", "gt", "lt", "gte", "lte", "is_null", "not_null"],
  uuid: ["eq", "neq", "is_null", "not_null", "in"],
  json: ["is_null", "not_null"],
  enum: ["eq", "neq", "is_null", "not_null", "in"],
  unknown: ["eq", "neq", "is_null", "not_null"],
};

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: "=",
  neq: "≠",
  like: "matches (like)",
  ilike: "contains",
  is_null: "is empty",
  not_null: "is not empty",
  in: "in",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
};
