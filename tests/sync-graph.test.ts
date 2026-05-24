import { describe, expect, it } from "vitest";
import { atRiskForeignKeys, topoSyncOrder } from "@/server/sync/graph";
import type { TableAction } from "@/server/schema/sync";
import { catalog, col, fk, table } from "./sync-fixtures";

/**
 * FK dependency analysis: copy ordering, cycle detection, and the at-risk-FK
 * logic that drives the "this column references an excluded table" resolution.
 */

const users = table("public", "users", [col("id", "uuid")], { primaryKey: ["id"] });
const orders = table("public", "orders", [col("id", "uuid"), col("user_id", "uuid")], {
  primaryKey: ["id"],
  foreignKeys: [fk("orders_user_fk", ["user_id"], "users", ["id"])],
});
const items = table("public", "items", [col("id", "uuid"), col("order_id", "uuid")], {
  primaryKey: ["id"],
  foreignKeys: [fk("items_order_fk", ["order_id"], "orders", ["id"])],
});

describe("topoSyncOrder", () => {
  it("orders parents before children", () => {
    const { order, cycles } = topoSyncOrder(catalog([items, orders, users]), () => true);
    expect(cycles).toHaveLength(0);
    expect(order.indexOf("public.users")).toBeLessThan(order.indexOf("public.orders"));
    expect(order.indexOf("public.orders")).toBeLessThan(order.indexOf("public.items"));
  });

  it("ignores edges to non-synced parents", () => {
    // users not synced → orders has no ordering constraint, still appears.
    const isSynced = (q: string) => q !== "public.users";
    const { order } = topoSyncOrder(catalog([users, orders]), isSynced);
    expect(order).toContain("public.orders");
    expect(order).not.toContain("public.users");
  });

  it("detects a cycle and excludes it from the order", () => {
    const a = table("public", "a", [col("id"), col("b_id")], {
      primaryKey: ["id"],
      foreignKeys: [fk("a_b", ["b_id"], "b", ["id"])],
    });
    const b = table("public", "b", [col("id"), col("a_id")], {
      primaryKey: ["id"],
      foreignKeys: [fk("b_a", ["a_id"], "a", ["id"])],
    });
    const { order, cycles } = topoSyncOrder(catalog([a, b]), () => true);
    expect(order).toHaveLength(0);
    expect(cycles.flat().sort()).toEqual(["public.a", "public.b"]);
  });

  it("treats a self-reference as orderable but flags it", () => {
    const t = table("public", "node", [col("id"), col("parent_id")], {
      primaryKey: ["id"],
      foreignKeys: [fk("node_parent", ["parent_id"], "node", ["id"])],
    });
    const { order, selfReferential } = topoSyncOrder(catalog([t]), () => true);
    expect(order).toEqual(["public.node"]);
    expect(selfReferential).toEqual(["public.node"]);
  });
});

describe("atRiskForeignKeys", () => {
  const action = (excluded: string[]): ((q: string) => TableAction) => (q) =>
    excluded.includes(q) ? "exclude" : "sync";

  it("flags a synced FK into an excluded table", () => {
    const risks = atRiskForeignKeys(catalog([users, orders]), action(["public.users"]));
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      table: "public.orders",
      columns: ["user_id"],
      refTable: "public.users",
      refAction: "exclude",
    });
  });

  it("does not flag a sync→sync FK (parent gets base's PKs)", () => {
    const risks = atRiskForeignKeys(catalog([users, orders]), action([]));
    expect(risks).toHaveLength(0);
  });

  it("flags FKs into never-sync schemas (auth)", () => {
    const profiles = table("public", "profiles", [col("id", "uuid")], {
      primaryKey: ["id"],
      foreignKeys: [fk("profiles_auth_fk", ["id"], "auth.users", ["id"])],
    });
    const risks = atRiskForeignKeys(catalog([profiles]), action([]));
    expect(risks).toHaveLength(1);
    expect(risks[0]!.refAction).toBe("never_sync");
  });
});
