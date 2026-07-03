import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "@/server/sync/plan";
import { DEFAULT_SYNC_OPTIONS, type SyncTableConfig } from "@/server/schema/sync";
import { catalog, col, fk, table } from "./sync-fixtures";

const users = () => table("public", "users", [col("id", "uuid")], { primaryKey: ["id"] });
const orders = () =>
  table("public", "orders", [col("id", "uuid"), col("user_id", "uuid")], {
    primaryKey: ["id"],
    foreignKeys: [fk("orders_user_fk", ["user_id"], "users", ["id"])],
  });

const cfg = (tables: SyncTableConfig["tables"] = {}): SyncTableConfig => ({ tables });

describe("buildSyncPlan", () => {
  it("plans a clean matching sync parents-first with no blockers", () => {
    const cat = catalog([users(), orders()]);
    const plan = buildSyncPlan({ base: cat, target: cat, tableConfig: cfg(), options: DEFAULT_SYNC_OPTIONS });
    expect(plan.blocking).toBe(false);
    expect(plan.order).toEqual(["public.users", "public.orders"]);
    expect(plan.truncateOrder).toEqual(["public.orders", "public.users"]);
  });

  it("blocks when a synced FK points at an excluded table", () => {
    const cat = catalog([users(), orders()]);
    const plan = buildSyncPlan({
      base: cat,
      target: cat,
      tableConfig: cfg({ "public.users": { action: "exclude" } }),
      options: DEFAULT_SYNC_OPTIONS,
    });
    expect(plan.unresolvedRisks.length).toBe(1);
    expect(plan.blocking).toBe(true);
  });

  it("clears the block once the FK is resolved, and records the transform", () => {
    const cat = catalog([users(), orders()]);
    const plan = buildSyncPlan({
      base: cat,
      target: cat,
      tableConfig: cfg({
        "public.users": { action: "exclude" },
        "public.orders": { action: "sync", fk: { user_id: { strategy: "null" } } },
      }),
      options: DEFAULT_SYNC_OPTIONS,
    });
    expect(plan.unresolvedRisks).toHaveLength(0);
    expect(plan.blocking).toBe(false);
    const op = plan.tables.find((t) => t.qualified === "public.orders")!;
    expect(op.transforms).toEqual([{ column: "user_id", strategy: "null", remapTo: undefined, castType: "uuid" }]);
  });

  it("blocks on invalid anonymization (hash on a non-text column)", () => {
    const t = table("public", "orders", [col("id", "uuid"), col("total", "integer")], { primaryKey: ["id"] });
    const cat = catalog([t]);
    const plan = buildSyncPlan({
      base: cat,
      target: cat,
      tableConfig: cfg({ "public.orders": { action: "sync", anonymize: { total: { strategy: "hash" } } } }),
      options: DEFAULT_SYNC_OPTIONS,
    });
    expect(plan.blocking).toBe(true);
    expect(plan.blockingReasons.join(" ")).toMatch(/text column/i);
  });

  it("blocks when an anonymization rule points at a column missing on the base", () => {
    const t = table("public", "users", [col("id", "uuid")], { primaryKey: ["id"] });
    const cat = catalog([t]);
    const plan = buildSyncPlan({
      base: cat,
      target: cat,
      tableConfig: cfg({ "public.users": { action: "sync", anonymize: { ssn: { strategy: "null" } } } }),
      options: DEFAULT_SYNC_OPTIONS,
    });
    expect(plan.blocking).toBe(true);
    expect(plan.blockingReasons.join(" ")).toMatch(/does not exist on the base/i);
  });

  it("warns when a row cap will truncate large tables", () => {
    const t = table("public", "orders", [col("id", "uuid")], {
      primaryKey: ["id"],
      estimatedRows: 5000,
    });
    const cat = catalog([t]);
    const plan = buildSyncPlan({
      base: cat,
      target: cat,
      tableConfig: cfg(),
      options: { ...DEFAULT_SYNC_OPTIONS, rowCap: 100 },
    });
    expect(plan.warnings.join(" ")).toMatch(/row cap 100/i);
    expect(plan.warnings.join(" ")).toMatch(/public\.orders/);
  });

  it("warns about triggers on synced tables", () => {
    const t = table("public", "orders", [col("id", "uuid")], {
      primaryKey: ["id"],
      triggers: [{ name: "audit_trg" }],
    });
    const cat = catalog([t]);
    const plan = buildSyncPlan({ base: cat, target: cat, tableConfig: cfg(), options: DEFAULT_SYNC_OPTIONS });
    expect(plan.warnings.join(" ")).toMatch(/trigger/i);
  });

  it("blocks on a schema mismatch without applySchema, but not with it", () => {
    const base = catalog([table("public", "orders", [col("id", "uuid"), col("total", "integer")], { primaryKey: ["id"] })]);
    const target = catalog([table("public", "orders", [col("id", "uuid")], { primaryKey: ["id"] })]);

    const off = buildSyncPlan({ base, target, tableConfig: cfg(), options: DEFAULT_SYNC_OPTIONS });
    expect(off.blocking).toBe(true);

    const on = buildSyncPlan({
      base,
      target,
      tableConfig: cfg(),
      options: { ...DEFAULT_SYNC_OPTIONS, applySchema: true },
    });
    expect(on.blocking).toBe(false);
    expect(on.schemaDiff.hasChanges).toBe(true);
  });
});
