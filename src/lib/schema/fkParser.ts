import type { ForeignKey } from "./types";

const MACHINE_TAG = /<fk\s+table=['"]([^'"]+)['"]\s+column=['"]([^'"]+)['"]\s*\/?\s*>/i;
const READABLE_QUALIFIED = /Foreign Key to\s+`?([\w$]+)\.([\w$]+)\.([\w$]+)`?/i;
const READABLE_UNQUALIFIED = /Foreign Key to\s+`?([\w$]+)\.([\w$]+)`?/i;

export function parseFk(description: string | undefined): ForeignKey | undefined {
  if (!description) return undefined;

  const machine = description.match(MACHINE_TAG);
  if (machine) {
    const table = machine[1];
    const column = machine[2];
    if (table && column) {
      // PostgREST sometimes qualifies as schema.table — split on the first dot.
      const dotIndex = table.indexOf(".");
      if (dotIndex > 0) {
        return {
          schema: table.slice(0, dotIndex),
          table: table.slice(dotIndex + 1),
          column,
        };
      }
      return { schema: "public", table, column };
    }
  }

  const qualified = description.match(READABLE_QUALIFIED);
  if (qualified) {
    const [, schema, table, column] = qualified;
    if (schema && table && column) return { schema, table, column };
  }

  const unqualified = description.match(READABLE_UNQUALIFIED);
  if (unqualified) {
    const [, table, column] = unqualified;
    if (table && column) return { schema: "public", table, column };
  }

  return undefined;
}

export function stripPostgrestTags(description: string | undefined): string | undefined {
  if (!description) return undefined;
  return description
    .replace(MACHINE_TAG, "")
    .replace(/<pk\s*\/?\s*>/gi, "")
    .replace(/<gen\s*\/?\s*>/gi, "")
    .replace(/Note:\s*\n?/i, "")
    .replace(/This is a Foreign Key to[^\n]*/i, "")
    .trim() || undefined;
}

export function hasPkTag(description: string | undefined): boolean {
  if (!description) return false;
  return /<pk\s*\/?\s*>/i.test(description);
}
