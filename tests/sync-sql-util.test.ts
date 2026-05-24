import { describe, expect, it } from "vitest";
import { quoteIdent, quoteLiteral, tableIdent } from "@/server/sync/sql-util";

/**
 * Identifier/literal quoting is the injection-sensitive surface of the sync
 * engine (FK remap values, anonymization fixed values, and table/column names
 * all flow through it into COPY/DDL). Pin the escaping.
 */

describe("quoteIdent", () => {
  it("wraps in double quotes", () => {
    expect(quoteIdent("orders")).toBe('"orders"');
  });
  it("doubles embedded double quotes", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });
  it("neutralises an injection attempt in an identifier", () => {
    expect(quoteIdent('x"; DROP TABLE users;--')).toBe('"x""; DROP TABLE users;--"');
  });
});

describe("quoteLiteral", () => {
  it("wraps in single quotes", () => {
    expect(quoteLiteral("hello")).toBe("'hello'");
  });
  it("doubles embedded single quotes", () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'");
  });
  it("neutralises an injection attempt in a literal", () => {
    expect(quoteLiteral("'); DROP TABLE users;--")).toBe("'''); DROP TABLE users;--'");
  });
});

describe("tableIdent", () => {
  it("qualifies schema.table with quoting", () => {
    expect(tableIdent("public", "orders")).toBe('"public"."orders"');
  });
});
