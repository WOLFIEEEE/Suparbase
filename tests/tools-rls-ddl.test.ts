import { describe, expect, it } from "vitest";
import { generateRlsPolicies, explainPolicy } from "@/lib/tools/rls";
import { parseDdl } from "@/lib/tools/ddl";

describe("generateRlsPolicies", () => {
  it("owner pattern emits per-command policies keyed on auth.uid()", () => {
    const sql = generateRlsPolicies({ table: "orders", pattern: "owner", ownerColumn: "user_id" });
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('FOR SELECT TO authenticated');
    expect(sql).toContain('"user_id" = auth.uid()');
    expect(sql).toContain("WITH CHECK");
    expect(sql).toMatch(/FOR (INSERT|UPDATE|DELETE)/);
  });

  it("public_read allows anon SELECT only", () => {
    const sql = generateRlsPolicies({ table: "posts", pattern: "public_read" });
    expect(sql).toContain("FOR SELECT TO anon, authenticated");
    expect(sql).toContain("USING (true)");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("service_only enables RLS with no permissive policy", () => {
    const sql = generateRlsPolicies({ table: "secrets", pattern: "service_only" });
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toContain("CREATE POLICY");
  });

  it("quotes identifiers and respects a custom schema", () => {
    const sql = generateRlsPolicies({ table: "weird name", schema: "app", pattern: "authenticated_read" });
    expect(sql).toContain('"app"."weird name"');
  });
});

describe("explainPolicy", () => {
  it("describes a public read policy and warns it is fully public", () => {
    const e = explainPolicy(`CREATE POLICY "public_select" ON posts FOR SELECT TO anon, authenticated USING (true);`);
    expect(e.ok).toBe(true);
    expect(e.command).toBe("SELECT");
    expect(e.roles).toContain("anon");
    expect(e.summary).toMatch(/fully public|anyone can read/i);
  });

  it("describes an owner policy with its USING condition", () => {
    const e = explainPolicy(`CREATE POLICY "own" ON orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`);
    expect(e.command).toBe("ALL");
    expect(e.using).toContain("auth.uid()");
    expect(e.withCheck).toContain("auth.uid()");
    expect(e.summary).toContain("orders");
  });

  it("fails gracefully on non-policy input", () => {
    const e = explainPolicy("SELECT * FROM users");
    expect(e.ok).toBe(false);
  });
});

describe("parseDdl", () => {
  const ddl = `
    create table public.users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique
    );
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id),
      amount numeric(10,2),
      status text DEFAULT 'pending'
    );
  `;

  it("parses tables, columns, PK and inline FK", () => {
    const s = parseDdl(ddl);
    expect(s.tables.map((t) => t.name).sort()).toEqual(["orders", "users"]);
    const orders = s.tables.find((t) => t.name === "orders")!;
    expect(orders.columns.find((c) => c.name === "id")!.isPrimaryKey).toBe(true);
    const fkCol = orders.columns.find((c) => c.name === "user_id")!;
    expect(fkCol.references).toEqual({ table: "users", column: "id" });
    expect(s.edges).toContainEqual({ from: "orders", fromColumn: "user_id", to: "users", toColumn: "id" });
  });

  it("handles table-level FOREIGN KEY constraints", () => {
    const s = parseDdl(`
      CREATE TABLE a (id int PRIMARY KEY);
      CREATE TABLE b (
        id int PRIMARY KEY,
        a_id int,
        FOREIGN KEY (a_id) REFERENCES a (id)
      );
    `);
    const b = s.tables.find((t) => t.name === "b")!;
    expect(b.columns.find((c) => c.name === "a_id")!.references).toEqual({ table: "a", column: "id" });
  });

  it("warns when no tables are found", () => {
    const s = parseDdl("SELECT 1;");
    expect(s.tables).toHaveLength(0);
    expect(s.warnings.join(" ")).toMatch(/No CREATE TABLE/i);
  });
});
