import { describe, expect, it } from "vitest";
import { generateTypes } from "@/lib/tools/types-gen";

const DDL = `
  create table public.users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    age int,
    is_active boolean not null default true,
    metadata jsonb,
    created_at timestamptz not null default now(),
    tags text[]
  );
`;

describe("generateTypes - typescript", () => {
  const { code, tableCount } = generateTypes({ ddl: DDL, target: "typescript" });

  it("emits one interface per table with PascalCase name", () => {
    expect(tableCount).toBe(1);
    expect(code).toContain("export interface Users {");
  });

  it("maps postgres types to typescript types", () => {
    expect(code).toContain("id: string;");
    expect(code).toContain("age: number | null;");
    expect(code).toContain("is_active: boolean;");
    expect(code).toContain("metadata: unknown | null;");
    expect(code).toContain("created_at: string;");
  });

  it("marks nullable columns with | null and arrays with []", () => {
    expect(code).toContain("email: string;"); // not null
    expect(code).toContain("tags: string[] | null;"); // nullable array
  });
});

describe("generateTypes - zod", () => {
  const { code } = generateTypes({ ddl: DDL, target: "zod" });

  it("emits a zod object schema and inferred type", () => {
    expect(code).toContain('import { z } from "zod";');
    expect(code).toContain("export const usersSchema = z.object({");
    expect(code).toContain("export type Users = z.infer<typeof usersSchema>;");
  });

  it("uses .nullable() for nullable columns", () => {
    expect(code).toContain("email: z.string(),");
    expect(code).toContain("age: z.number().nullable(),");
    expect(code).toContain("tags: z.array(z.string()).nullable(),");
  });
});

describe("generateTypes - edge cases", () => {
  it("quotes non-identifier column names", () => {
    const { code } = generateTypes({
      ddl: `create table t ("weird name" text not null, id int primary key);`,
      target: "typescript",
    });
    expect(code).toContain('"weird name": string;');
  });

  it("returns empty code and warnings when no tables parse", () => {
    const { code, tableCount, warnings } = generateTypes({ ddl: "select 1;", target: "typescript" });
    expect(code).toBe("");
    expect(tableCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("prefixes type names that start with a digit", () => {
    const { code } = generateTypes({
      ddl: `create table "2fa_codes" (id int primary key);`,
      target: "typescript",
    });
    expect(code).toContain("export interface T2faCodes {");
  });
});
