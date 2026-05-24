import { describe, expect, it } from "vitest";
import { computeSchemaDiff } from "@/server/sync/schema-diff";
import type { SyncOptions } from "@/server/schema/sync";
import { catalog, col, pkConstraint, table } from "./sync-fixtures";

const additive: SyncOptions = { applySchema: true, allowDestructive: false, rowCap: null };
const destructive: SyncOptions = { applySchema: true, allowDestructive: true, rowCap: null };

const synced = (...qs: string[]) => new Set(qs);

describe("computeSchemaDiff", () => {
  it("creates a table missing on the target", () => {
    const orders = table("public", "orders", [col("id", "uuid"), col("total", "integer")], {
      primaryKey: ["id"],
      constraints: [pkConstraint("orders_pkey", ["id"])],
    });
    const diff = computeSchemaDiff(catalog([orders]), catalog([]), synced("public.orders"), additive);
    expect(diff.preCopy.join("\n")).toContain("CREATE TABLE IF NOT EXISTS");
    expect(diff.summary.some((s) => s.kind === "create_table")).toBe(true);
    expect(diff.blockers).toHaveLength(0);
  });

  it("adds a missing column and defers SET NOT NULL to post-copy", () => {
    const base = table("public", "orders", [col("id", "uuid"), col("total", "integer", { notNull: true })], {
      primaryKey: ["id"],
    });
    const target = table("public", "orders", [col("id", "uuid")], { primaryKey: ["id"] });
    const diff = computeSchemaDiff(catalog([base]), catalog([target]), synced("public.orders"), additive);
    expect(diff.preCopy.join("\n")).toContain("ADD COLUMN IF NOT EXISTS");
    expect(diff.postCopy.join("\n")).toContain("SET NOT NULL");
  });

  it("blocks on a column type change", () => {
    const base = table("public", "orders", [col("id", "uuid")], { primaryKey: ["id"] });
    const target = table("public", "orders", [col("id", "text")], { primaryKey: ["id"] });
    const diff = computeSchemaDiff(catalog([base]), catalog([target]), synced("public.orders"), additive);
    expect(diff.blockers.join(" ")).toMatch(/type differs/i);
  });

  it("blocks on an extra NOT NULL target column without destructive enabled", () => {
    const base = table("public", "orders", [col("id", "uuid")], { primaryKey: ["id"] });
    const target = table("public", "orders", [col("id", "uuid"), col("legacy", "text", { notNull: true })], {
      primaryKey: ["id"],
    });
    const diff = computeSchemaDiff(catalog([base]), catalog([target]), synced("public.orders"), additive);
    expect(diff.blockers.join(" ")).toMatch(/legacy/);
  });

  it("drops an extra column when destructive is enabled", () => {
    const base = table("public", "orders", [col("id", "uuid")], { primaryKey: ["id"] });
    const target = table("public", "orders", [col("id", "uuid"), col("legacy", "text", { notNull: true })], {
      primaryKey: ["id"],
    });
    const diff = computeSchemaDiff(catalog([base]), catalog([target]), synced("public.orders"), destructive);
    expect(diff.destructive.join("\n")).toContain("DROP COLUMN IF EXISTS");
    expect(diff.blockers).toHaveLength(0);
  });

  it("creates a missing enum and adds missing enum values", () => {
    const baseCat = catalog([], [
      { schema: "public", name: "status", values: ["a", "b", "c"] },
    ]);
    const targetCat = catalog([], [{ schema: "public", name: "status", values: ["a"] }]);
    const diff = computeSchemaDiff(baseCat, targetCat, synced(), additive);
    expect(diff.preCopy.join("\n")).toMatch(/ADD VALUE IF NOT EXISTS/);
  });

  it("drops an extra target table only when destructive", () => {
    const base = catalog([]);
    const target = catalog([table("public", "stale", [col("id")])]);
    expect(computeSchemaDiff(base, target, synced(), additive).destructive).toHaveLength(0);
    expect(computeSchemaDiff(base, target, synced(), destructive).destructive.join("\n")).toContain(
      "DROP TABLE IF EXISTS",
    );
  });
});
