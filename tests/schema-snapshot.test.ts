import { describe, expect, it } from "vitest";
import {
  diffSnapshots,
  summarizeDiff,
  toSnapshotTables,
  type SnapshotTable,
} from "@/lib/schema-snapshot";
import type { Schema } from "@/lib/types/schema";

function table(name: string, columns: SnapshotTable["columns"], pk: string[] = ["id"]): SnapshotTable {
  return { schema: "public", name, kind: "table", primaryKey: pk, columns };
}
const id = { name: "id", pgType: "uuid", nullable: false, defaultValue: "gen_random_uuid()" };

describe("diffSnapshots", () => {
  it("reports identical snapshots as no changes", () => {
    const a = [table("users", [id, { name: "email", pgType: "text", nullable: false, defaultValue: null }])];
    const d = diffSnapshots(a, structuredClone(a));
    expect(d.identical).toBe(true);
    expect(d.changeCount).toBe(0);
    expect(summarizeDiff(d)).toBe("No changes");
  });

  it("detects added and removed tables", () => {
    const before = [table("users", [id])];
    const after = [table("orders", [id])];
    const d = diffSnapshots(before, after);
    expect(d.addedTables.map((t) => t.name)).toEqual(["orders"]);
    expect(d.removedTables.map((t) => t.name)).toEqual(["users"]);
    expect(d.changeCount).toBe(2);
    expect(summarizeDiff(d)).toBe("+1 table · -1 table");
  });

  it("detects column adds, drops, type / nullability / default / fk changes", () => {
    const before = [
      table("orders", [
        id,
        { name: "amount", pgType: "integer", nullable: true, defaultValue: null },
        { name: "legacy", pgType: "text", nullable: true, defaultValue: null },
        { name: "user_id", pgType: "uuid", nullable: false, defaultValue: null },
      ]),
    ];
    const after = [
      table("orders", [
        id,
        { name: "amount", pgType: "numeric", nullable: false, defaultValue: "0" },
        { name: "status", pgType: "text", nullable: false, defaultValue: "'pending'" },
        {
          name: "user_id",
          pgType: "uuid",
          nullable: false,
          defaultValue: null,
          fk: { schema: "public", table: "users", column: "id" },
        },
      ]),
    ];
    const d = diffSnapshots(before, after);
    expect(d.changedTables).toHaveLength(1);
    const t = d.changedTables[0]!;
    expect(t.table).toBe("public.orders");
    expect(t.addedColumns.map((c) => c.name)).toEqual(["status"]);
    expect(t.removedColumns.map((c) => c.name)).toEqual(["legacy"]);
    expect(t.changedColumns.map((c) => `${c.column}:${c.kind}`).sort()).toEqual([
      "amount:default",
      "amount:nullable",
      "amount:type",
      "user_id:fk",
    ]);
    expect(t.primaryKeyChanged).toBeNull();
    expect(d.changeCount).toBe(6);
    expect(summarizeDiff(d)).toBe("+1 column · -1 column · 4 altered");
  });

  it("flags a primary key change", () => {
    const before = [table("t", [id], ["id"])];
    const after = [table("t", [id, { name: "tenant", pgType: "uuid", nullable: false, defaultValue: null }], ["tenant", "id"])];
    const d = diffSnapshots(before, after);
    expect(d.changedTables[0]?.primaryKeyChanged).toEqual({ from: ["id"], to: ["tenant", "id"] });
  });

  it("matches tables on schema-qualified names", () => {
    const before = [{ ...table("events", [id]), schema: "public" }];
    const after = [{ ...table("events", [id]), schema: "analytics" }];
    const d = diffSnapshots(before, after);
    expect(d.addedTables[0]?.schema).toBe("analytics");
    expect(d.removedTables[0]?.schema).toBe("public");
  });
});

describe("toSnapshotTables", () => {
  it("drops UI-only fields, keeps fks, and sorts by qualified name", () => {
    const schema: Schema = {
      introspectedAt: 1,
      hostname: "x.supabase.co",
      tables: [
        {
          schema: "public",
          name: "zeta",
          kind: "table",
          primaryKey: ["id"],
          labelColumn: "name",
          columns: [
            {
              name: "id",
              pgType: "uuid",
              category: "uuid",
              nullable: false,
              defaultValue: null,
              isPrimaryKey: true,
              isGenerated: false,
            },
            {
              name: "owner",
              pgType: "uuid",
              category: "uuid",
              nullable: true,
              defaultValue: null,
              isPrimaryKey: false,
              isGenerated: false,
              fk: { schema: "public", table: "users", column: "id" },
              comment: "ignored",
            },
          ],
        },
        {
          schema: "public",
          name: "alpha",
          kind: "view",
          primaryKey: [],
          labelColumn: null,
          columns: [],
        },
      ],
    };
    const out = toSnapshotTables(schema);
    expect(out.map((t) => t.name)).toEqual(["alpha", "zeta"]);
    expect(out[1]!.columns[1]).toEqual({
      name: "owner",
      pgType: "uuid",
      nullable: true,
      defaultValue: null,
      fk: { schema: "public", table: "users", column: "id" },
    });
    expect("labelColumn" in out[1]!).toBe(false);
  });
});
