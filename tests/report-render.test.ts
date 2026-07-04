import { describe, expect, it } from "vitest";
import { resultToHtmlTable, resultToCsv } from "@/server/reports/render";
import type { SqlExecuteResult } from "@/server/proxy/sql-playground";

function result(partial: Partial<SqlExecuteResult>): SqlExecuteResult {
  return {
    columns: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    elapsedMs: 1,
    command: "SELECT",
    notices: [],
    readOnly: true,
    ...partial,
  };
}

describe("resultToHtmlTable", () => {
  it("renders a table with headers and escapes HTML in cells", () => {
    const html = resultToHtmlTable(
      result({
        columns: [{ name: "name", typeOid: 25 }],
        rows: [["<script>alert(1)</script>"]],
        rowCount: 1,
      }),
    );
    expect(html).toContain("<th");
    expect(html).toContain("name");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("notes truncation when rows exceed the cap", () => {
    const rows = Array.from({ length: 5 }, (_, i) => [i]);
    const html = resultToHtmlTable(
      result({ columns: [{ name: "n", typeOid: 23 }], rows, rowCount: 5 }),
      2,
    );
    expect(html).toMatch(/and 3 more rows/);
  });

  it("handles a no-column result", () => {
    const html = resultToHtmlTable(result({ command: "UPDATE 4" }));
    expect(html).toContain("UPDATE 4");
    expect(html).toContain("no columns");
  });
});

describe("resultToCsv", () => {
  it("produces an RFC-4180 header + rows and quotes commas", () => {
    const csv = resultToCsv(
      result({
        columns: [{ name: "a", typeOid: 25 }, { name: "b", typeOid: 25 }],
        rows: [["x,y", "z"]],
        rowCount: 1,
      }),
    );
    expect(csv).toContain("a,b\r\n");
    expect(csv).toContain('"x,y",z');
  });
});
