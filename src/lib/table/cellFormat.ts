import type { Column } from "@/lib/types/schema";

export interface FormattedCell {
  text: string;
  isNull: boolean;
  truncated: boolean;
}

const MAX_INLINE = 80;

export function formatCellValue(col: Column, value: unknown): FormattedCell {
  if (value === null || value === undefined) {
    return { text: "—", isNull: true, truncated: false };
  }

  switch (col.category) {
    case "boolean":
      return { text: value ? "true" : "false", isNull: false, truncated: false };
    case "json": {
      const text = typeof value === "string" ? value : safeStringify(value);
      return truncate(text);
    }
    case "datetime":
    case "date":
      return truncate(String(value));
    case "integer":
    case "float":
      return { text: String(value), isNull: false, truncated: false };
    default:
      return truncate(String(value));
  }
}

function truncate(text: string): FormattedCell {
  if (text.length <= MAX_INLINE) return { text, isNull: false, truncated: false };
  return { text: text.slice(0, MAX_INLINE) + "…", isNull: false, truncated: true };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
