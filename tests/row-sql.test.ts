import { describe, expect, it } from "vitest";
import { quoteIdentifier, quoteLiteral, rowToInsertSql, rowToJson } from "@/lib/table/row-sql";
import type { Column, Table } from "@/lib/types/schema";

function col(name: string, pgType: string, category: Column["category"]): Column {
  return { name, pgType, category, nullable: true, defaultValue: null, isPrimaryKey: false, isGenerated: false };
}

const table: Table = {
  schema: "public",
  name: "orders",
  kind: "table",
  primaryKey: ["id"],
  labelColumn: null,
  columns: [
    col("id", "uuid", "uuid"),
    col("note", "text", "text"),
    col("qty", "integer", "integer"),
    col("paid", "boolean", "boolean"),
    col("meta", "jsonb", "json"),
    col("tags", "text[]", "unknown"),
    col("missing", "text", "text"),
  ],
};

describe("quoting", () => {
  it("doubles embedded quotes", () => {
    expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
    expect(quoteLiteral("it's")).toBe("'it''s'");
  });
});

describe("rowToInsertSql", () => {
  it("emits typed literals for each column present in the row", () => {
    const sql = rowToInsertSql(table, {
      id: "abc",
      note: "O'Reilly",
      qty: 3,
      paid: true,
      meta: { a: 1 },
      tags: ["x", "y"],
    });
    expect(sql).toContain('INSERT INTO "public"."orders" ("id", "note", "qty", "paid", "meta", "tags")');
    expect(sql).toContain("'O''Reilly'");
    expect(sql).toContain("  3,");
    expect(sql).toContain("  true,");
    expect(sql).toContain(`'{"a":1}'::jsonb`);
    expect(sql).toContain("ARRAY['x', 'y']");
    expect(sql).not.toContain('"missing"');
    expect(sql.trim().endsWith(");")).toBe(true);
  });

  it("writes NULL for null / undefined and skips absent keys", () => {
    const sql = rowToInsertSql(table, { id: null, qty: undefined });
    expect(sql).toContain("NULL,\n  NULL");
    expect(sql).toContain('("id", "qty")');
  });

  it("serialises a jsonb array as jsonb, not a Postgres array", () => {
    const sql = rowToInsertSql(table, { meta: [1, 2] });
    expect(sql).toContain(`'[1,2]'::jsonb`);
  });
});

describe("rowToJson", () => {
  it("keeps column order then appends unknown keys", () => {
    const json = rowToJson(table, { extra: 1, qty: 2, id: "z" });
    expect(Object.keys(JSON.parse(json))).toEqual(["id", "qty", "extra"]);
  });
});
