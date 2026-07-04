import "server-only";
import { csvHeaderLine, csvLineFromValues } from "@/lib/csv/serialize";
import type { SqlExecuteResult } from "@/server/proxy/sql-playground";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Render a query result as a self-contained HTML table (inline styles so
 *  it survives every email client). Caps at 100 rows for the email body. */
export function resultToHtmlTable(result: SqlExecuteResult, cap = 100): string {
  if (result.columns.length === 0) {
    return `<p style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#666">${esc(result.command || "OK")} — no columns returned.</p>`;
  }
  const head = result.columns
    .map(
      (c) =>
        `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font:600 12px -apple-system,sans-serif;color:#333">${esc(c.name)}</th>`,
    )
    .join("");
  const bodyRows = result.rows
    .slice(0, cap)
    .map(
      (row) =>
        `<tr>${row
          .map(
            (v) =>
              `<td style="padding:6px 10px;border-bottom:1px solid #eee;font:13px -apple-system,sans-serif;color:#444">${esc(cell(v))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const more =
    result.rows.length > cap
      ? `<p style="font:12px sans-serif;color:#888;margin-top:8px">… and ${result.rows.length - cap} more rows (full set in the CSV attachment).</p>`
      : "";
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%"><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>${more}`;
}

/** Render a query result as an RFC-4180 CSV string (full set). */
export function resultToCsv(result: SqlExecuteResult): string {
  let out = csvHeaderLine(result.columns.map((c) => c.name));
  for (const row of result.rows) out += csvLineFromValues(row);
  return out;
}
