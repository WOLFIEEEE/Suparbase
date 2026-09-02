/**
 * Streaming CSV serializer. Hand-rolled per Constitution Technology
 * Standards (no new deps). RFC 4180 quoting rules plus spreadsheet
 * formula-injection protection for untrusted string cells.
 */

const NEEDS_QUOTE_RE = /[",\r\n]/;

export function csvHeaderLine(columns: string[]): string {
  return columns.map(neutralizeFormula).map(escapeField).join(",") + "\r\n";
}

export function csvLineFromValues(values: unknown[]): string {
  return values.map(toSafeField).map(escapeField).join(",") + "\r\n";
}

function toSafeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") return neutralizeFormula(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Excel, Numbers, and some spreadsheet importers execute cells beginning
 * with =, +, -, or @. Leading whitespace/control characters can hide the
 * marker from a naive check, so prefix suspicious text with the conventional
 * apostrophe escape. Numeric values remain numeric because this is only called
 * for strings and column labels.
 */
function neutralizeFormula(value: string): string {
  return /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeField(s: string): string {
  if (!NEEDS_QUOTE_RE.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}
