import { describe, expect, it } from "vitest";
import { schemaToParsed } from "@/lib/tools/from-schema";
import { generateTypesFromTables } from "@/lib/tools/types-gen";
import type { Column, Table } from "@/lib/types/schema";

function col(name: string, pgType: string, extra: Partial<Column> = {}): Column {
  return {
    name,
    pgType,
    category: "unknown",
    nullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    isGenerated: false,
    ...extra,
  };
}

const users: Table = {
  schema: "public",
  name: "users",
  kind: "table",
  primaryKey: ["id"],
  labelColumn: null,
  columns: [col("id", "uuid", { nullable: false, isPrimaryKey: true }), col("email", "text", { nullable: false })],
};
const orders: Table = {
  schema: "public",
  name: "orders",
  kind: "table",
  primaryKey: ["id"],
  labelColumn: null,
  columns: [
    col("id", "bigint", { nullable: false }),
    col("user_id", "uuid", { fk: { schema: "public", table: "users", column: "id" } }),
    col("tags", "text[]"),
    col("owner", "uuid", { fk: { schema: "auth", table: "users", column: "id" } }),
  ],
};

describe("schemaToParsed", () => {
  it("maps columns, primary keys (from the table list too), and fk edges", () => {
    const parsed = schemaToParsed([users, orders]);
    expect(parsed.tables.map((t) => t.name)).toEqual(["users", "orders"]);
    const ordersParsed = parsed.tables[1]!;
    expect(ordersParsed.columns[0]).toMatchObject({ name: "id", type: "bigint", isPrimaryKey: true, notNull: true });
    expect(ordersParsed.columns[1]!.references).toEqual({ table: "users", column: "id" });
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.edges[0]).toEqual({ from: "orders", fromColumn: "user_id", to: "users", toColumn: "id" });
  });

  it("warns about references that leave the selected set", () => {
    const parsed = schemaToParsed([orders]);
    expect(parsed.warnings.some((w) => w.includes("orders.user_id references users"))).toBe(true);
  });
});

describe("generateTypesFromTables", () => {
  it("emits nullable-aware TypeScript for a live schema", () => {
    const { code, tableCount } = generateTypesFromTables(schemaToParsed([users, orders]).tables, "typescript");
    expect(tableCount).toBe(2);
    expect(code).toContain("export interface Users {\n  id: string;\n  email: string;\n}");
    expect(code).toContain("tags: string[] | null;");
  });

  it("emits Zod when asked", () => {
    const { code } = generateTypesFromTables(schemaToParsed([users]).tables, "zod");
    expect(code).toContain('import { z } from "zod";');
    expect(code).toContain("export const usersSchema = z.object({");
    expect(code).toContain("email: z.string(),");
  });

  it("returns empty output for column-less tables", () => {
    expect(generateTypesFromTables([{ schema: "public", name: "empty", columns: [] }], "typescript")).toEqual({
      code: "",
      tableCount: 0,
      warnings: [],
    });
  });
});
