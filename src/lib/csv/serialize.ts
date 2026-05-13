/**
 * Streaming CSV serializer. Hand-rolled per Constitution Technology
 * Standards (no new deps). RFC 4180 quoting rules.
 */

const NEEDS_QUOTE_RE = /[",\r\n]/;

export function csvHeaderLine(columns: string[]): string {
  return columns.map(escapeField).join(",") + "\r\n";
}

export function csvLineFromValues(values: unknown[]): string {
  return values.map(toField).map(escapeField).join(",") + "\r\n";
}

function toField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeField(s: string): string {
  if (!NEEDS_QUOTE_RE.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}
