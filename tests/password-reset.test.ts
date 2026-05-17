import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashToken } from "@/server/auth/password-reset";

/**
 * Tests for the pure helpers in password-reset.ts. The full
 * issuance/consumption lifecycle hits the DB, which is stubbed in
 * tests - so we focus on the SHA-256 hashing primitive that's the
 * load-bearing piece for the "we never store plaintext tokens"
 * guarantee.
 */

describe("password-reset hashToken", () => {
  it("returns a stable SHA-256 hex digest", () => {
    const token = "abc123abc123abc123abc123abc123abc123abc123abc";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashToken(token)).toBe(expected);
    expect(hashToken(token)).toHaveLength(64);
  });

  it("different inputs produce different hashes", () => {
    const a = hashToken("token-a");
    const b = hashToken("token-b");
    expect(a).not.toBe(b);
  });

  it("hashes are deterministic across calls", () => {
    const t = "any-token-value";
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it("input is treated as raw bytes (no normalisation)", () => {
    // Trailing whitespace must matter - a hash collision between
    // "x" and "x " would let an attacker substitute equivalent
    // looking tokens.
    expect(hashToken("x")).not.toBe(hashToken("x "));
    expect(hashToken("ABC")).not.toBe(hashToken("abc"));
  });
});
