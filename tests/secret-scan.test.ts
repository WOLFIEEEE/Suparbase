import { describe, expect, it } from "vitest";
import { scanSecrets, summarize } from "@/lib/tools/secret-scan";

// A minimal JWT with a given role claim (header.payload.sig), base64url.
function jwt(role: string): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase" })}.c2lnbmF0dXJlX3BhcnRfaGVyZQ`;
}

describe("scanSecrets", () => {
  it("flags a Supabase service_role JWT as critical", () => {
    const m = scanSecrets(`const key = "${jwt("service_role")}"`);
    expect(m).toHaveLength(1);
    expect(m[0]!.type).toBe("supabase_service_role");
    expect(m[0]!.severity).toBe("critical");
  });

  it("classifies a Supabase anon JWT as info (public by design)", () => {
    const m = scanSecrets(`SUPABASE_ANON_KEY=${jwt("anon")}`);
    expect(m[0]!.type).toBe("supabase_anon");
    expect(m[0]!.severity).toBe("info");
  });

  it("flags a postgres connection URL as critical", () => {
    const m = scanSecrets("DATABASE_URL=postgres://user:pass@db.example.com:5432/app");
    expect(m.some((x) => x.type === "db_url" && x.severity === "critical")).toBe(true);
  });

  it("detects provider keys (openrouter before generic sk-)", () => {
    const m = scanSecrets("key=sk-or-AbCdEfGhIjKlMnOpQrSt");
    expect(m[0]!.type).toBe("openrouter_key");
  });

  it("detects resend, webhook and github tokens", () => {
    const text = "re_AbCdEfGhIjKlMnOpQrSt12 whsec_uPvKfYE2bA3xR4mQ8tWnB5gJoLc ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const types = scanSecrets(text).map((x) => x.type);
    expect(types).toContain("resend_key");
    expect(types).toContain("webhook_secret");
    expect(types).toContain("github_token");
  });

  it("does not double-report overlapping matches", () => {
    // A service_role JWT should be ONE match, not also a base64 blob.
    const m = scanSecrets(jwt("service_role"));
    expect(m).toHaveLength(1);
  });

  it("returns nothing for clean text", () => {
    expect(scanSecrets("const greeting = 'hello world';")).toHaveLength(0);
  });

  it("masks the matched value in the preview", () => {
    const m = scanSecrets("re_AbCdEfGhIjKlMnOpQrSt12");
    expect(m[0]!.preview).toContain("…");
    expect(m[0]!.preview).not.toBe("re_AbCdEfGhIjKlMnOpQrSt12");
  });

  it("summarize reports worst severity + counts", () => {
    const m = scanSecrets(`${jwt("service_role")} and re_AbCdEfGhIjKlMnOpQrSt12`);
    const s = summarize(m);
    expect(s.total).toBe(2);
    expect(s.worst).toBe("critical");
    expect(s.counts.critical).toBe(1);
    expect(s.counts.high).toBe(1);
  });
});
