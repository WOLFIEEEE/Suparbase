import { describe, expect, it } from "vitest";
import { parseConnectionImport, parseCsvRows } from "@/lib/connections/import-parse";

const KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";

describe("parseCsvRows", () => {
  it("handles quotes, escaped quotes, CRLF, and blank lines", () => {
    const rows = parseCsvRows('a,b\r\n"x, y","say ""hi"""\n\n1,2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });
});

describe("parseConnectionImport", () => {
  it("returns empty for blank input", () => {
    expect(parseConnectionImport("   ")).toEqual({ candidates: [], format: "empty", error: null });
  });

  it("parses a JSON array with aliased keys and validates each row", () => {
    const out = parseConnectionImport(
      JSON.stringify([
        { display_name: "prod", project_url: "https://abc.supabase.co/", anon_key: KEY, env: "Production" },
        { name: "", url: "http://nope", key: "x", postgres_url: "mysql://x", environment: "weird" },
      ]),
    );
    expect(out.format).toBe("json");
    expect(out.error).toBeNull();
    expect(out.candidates[0]).toMatchObject({
      name: "prod",
      url: "https://abc.supabase.co",
      key: KEY,
      postgresUrl: null,
      environment: "production",
      problems: [],
    });
    expect(out.candidates[1]!.problems).toEqual([
      "name is required",
      "url must be a https://*.supabase.co project URL",
      "key must be a JWT",
      "postgresUrl must start with postgres://",
      "environment must be production, staging, development, or other",
    ]);
  });

  it("accepts the export envelope shape { connections: [...] }", () => {
    const out = parseConnectionImport(JSON.stringify({ connections: [{ name: "a", url: "https://a.supabase.co", key: KEY }] }));
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.problems).toEqual([]);
  });

  it("parses CSV with a header row", () => {
    const csv = `name,url,key,postgresUrl,environment\nstaging,https://st.supabase.co,${KEY},postgresql://u:p@h:5432/db,staging`;
    const out = parseConnectionImport(csv);
    expect(out.format).toBe("csv");
    expect(out.candidates[0]).toMatchObject({
      name: "staging",
      postgresUrl: "postgresql://u:p@h:5432/db",
      environment: "staging",
      problems: [],
    });
  });

  it("rejects invalid JSON, non-array JSON, and over-long imports", () => {
    expect(parseConnectionImport("[not json").error).toBe("Invalid JSON.");
    expect(parseConnectionImport('{"a":1}').error).toContain("Expected a JSON array");
    const many = JSON.stringify(Array.from({ length: 51 }, () => ({ name: "x", url: "https://a.supabase.co", key: KEY })));
    expect(parseConnectionImport(many).error).toContain("Too many rows");
    expect(parseConnectionImport("name,url").error).toContain("header row");
  });
});
