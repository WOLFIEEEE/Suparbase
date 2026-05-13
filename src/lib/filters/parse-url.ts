import type { ChipSpec, FilterOperator } from "./types";

const FILTER_PARAM = "filter";

const OP_TO_INTERNAL: Record<string, FilterOperator> = {
  eq: "eq",
  neq: "neq",
  like: "like",
  ilike: "ilike",
  in: "in",
  gt: "gt",
  lt: "lt",
  gte: "gte",
  lte: "lte",
};

/**
 * Parse all repeated `filter=col.op.value` params into ChipSpec[].
 * Special forms:
 *   col.is.null      → { op: "is_null", value: null }
 *   col.not.is.null  → { op: "not_null", value: null }
 *   col.in.(a,b,c)   → { op: "in", value: ["a","b","c"] }
 *
 * Malformed chips are silently dropped (the URL is operator-supplied).
 */
export function parseFilterParams(searchParams: URLSearchParams): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const raw of searchParams.getAll(FILTER_PARAM)) {
    const chip = parseOne(raw);
    if (chip) out.push(chip);
  }
  return out;
}

function parseOne(raw: string): ChipSpec | null {
  // `not.is.null` is the only operator with a dot inside the op slot.
  if (/^([^.]+)\.not\.is\.null$/.test(raw)) {
    const m = raw.match(/^([^.]+)\.not\.is\.null$/);
    return m ? { column: m[1]!, op: "not_null", value: null } : null;
  }
  if (/^([^.]+)\.is\.null$/.test(raw)) {
    const m = raw.match(/^([^.]+)\.is\.null$/);
    return m ? { column: m[1]!, op: "is_null", value: null } : null;
  }

  const dot1 = raw.indexOf(".");
  if (dot1 <= 0) return null;
  const column = raw.slice(0, dot1);
  const rest = raw.slice(dot1 + 1);

  const dot2 = rest.indexOf(".");
  if (dot2 <= 0) return null;
  const opRaw = rest.slice(0, dot2);
  const valueRaw = rest.slice(dot2 + 1);

  const op = OP_TO_INTERNAL[opRaw];
  if (!op) return null;

  if (op === "in") {
    // Strip optional surrounding parens, split on commas, unquote.
    const inner = valueRaw.replace(/^\(|\)$/g, "");
    const parts = inner
      .split(",")
      .map((s) => s.trim())
      .map(unquote)
      .filter((s) => s.length > 0);
    return { column, op, value: parts };
  }

  return { column, op, value: unquote(valueRaw) };
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}
