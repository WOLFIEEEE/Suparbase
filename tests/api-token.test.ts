import { describe, expect, it } from "vitest";
import {
  DISPLAY_PREFIX_LENGTH,
  generateToken,
  hashToken,
  hashesEqual,
  isTokenShaped,
  parseBearer,
} from "@/server/api-tokens/token";

describe("api tokens", () => {
  it("generates sbp_ tokens with a stable hash and display prefix", () => {
    const t = generateToken();
    expect(t.plaintext.startsWith("sbp_")).toBe(true);
    expect(t.plaintext).toHaveLength(4 + 43);
    expect(isTokenShaped(t.plaintext)).toBe(true);
    expect(t.hash).toBe(hashToken(t.plaintext));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.prefix).toBe(t.plaintext.slice(0, DISPLAY_PREFIX_LENGTH));
  });

  it("never generates the same token twice", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateToken().plaintext));
    expect(seen.size).toBe(50);
  });

  it("rejects malformed tokens", () => {
    expect(isTokenShaped("sbp_short")).toBe(false);
    expect(isTokenShaped("abc_" + "a".repeat(43))).toBe(false);
    expect(isTokenShaped("sbp_" + "a".repeat(42) + "!")).toBe(false);
  });

  it("parses bearer headers case-insensitively and ignores other schemes", () => {
    const t = generateToken().plaintext;
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer   ${t}`)).toBe(t);
    expect(parseBearer(`Basic ${t}`)).toBeNull();
    expect(parseBearer("Bearer nope")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });

  it("compares digests in constant time without throwing on length mismatch", () => {
    const a = hashToken("x");
    expect(hashesEqual(a, hashToken("x"))).toBe(true);
    expect(hashesEqual(a, hashToken("y"))).toBe(false);
    expect(hashesEqual(a, "abcd")).toBe(false);
  });
});
