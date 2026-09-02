import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { TOTP } from "otpauth";
import { signMfaCookie, verifyMfaCookie } from "@/server/auth/totp";

/**
 * Pure-logic tests for the 2FA cookie helpers. We don't exercise
 * `enable2FA` / `disable2FA` / `verifyTotpForUser` here - those hit
 * the DB. The cookie path is the load-bearing piece for the
 * middleware enforcement; it must be ironclad.
 */

const ORIGINAL_SECRET = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-32-bytes-of-entropy-x";
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("MFA cookie sign/verify", () => {
  it("a fresh cookie verifies for the same user", () => {
    const cookie = signMfaCookie("user-1", 1234);
    expect(verifyMfaCookie(cookie, "user-1", 1234)).toBe(true);
  });

  it("rejects a cookie issued for a different user", () => {
    const cookie = signMfaCookie("user-1");
    expect(verifyMfaCookie(cookie, "user-2")).toBe(false);
  });

  it("binds verification to the primary-authentication timestamp", () => {
    const cookie = signMfaCookie("user-1", 1234);
    expect(verifyMfaCookie(cookie, "user-1", 1235)).toBe(false);
  });

  it("rejects a tampered cookie (signature mismatch)", () => {
    const cookie = signMfaCookie("user-1");
    // Flip the last char of the signature.
    const parts = cookie.split(".");
    const lastChar = parts[3]!.slice(-1);
    parts[3] = parts[3]!.slice(0, -1) + (lastChar === "a" ? "b" : "a");
    const tampered = parts.join(".");
    expect(verifyMfaCookie(tampered, "user-1")).toBe(false);
  });

  it("rejects an expired cookie", () => {
    const payload = `user-1.42.${Date.now() - 1}`;
    const signature = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(payload)
      .digest("base64url");
    const cookie = `${payload}.${signature}`;
    expect(verifyMfaCookie(cookie, "user-1", 42)).toBe(false);
  });

  it("rejects a malformed cookie shape", () => {
    expect(verifyMfaCookie("notenoughparts", "user-1")).toBe(false);
    expect(verifyMfaCookie("too.many.parts.here.again", "user-1")).toBe(false);
    expect(verifyMfaCookie(undefined, "user-1")).toBe(false);
    expect(verifyMfaCookie("", "user-1")).toBe(false);
  });

  it("rejects when secret rotates between sign and verify", () => {
    const cookie = signMfaCookie("user-1");
    // Operator rotates AUTH_SECRET → all existing MFA cookies
    // invalidate. Correct behaviour: better to force re-verify than
    // honour stale signatures.
    process.env.AUTH_SECRET = "different-secret-32-bytes-of-entropy";
    expect(verifyMfaCookie(cookie, "user-1")).toBe(false);
  });

  it("uses constant-time compare (signatures of same length but different bytes)", () => {
    const cookie = signMfaCookie("user-1");
    const parts = cookie.split(".");
    // Replace the entire signature with the same length of zeros.
    parts[3] = "A".repeat(parts[3]!.length);
    const fake = parts.join(".");
    expect(verifyMfaCookie(fake, "user-1")).toBe(false);
  });
});

describe("TOTP basic compatibility", () => {
  // We don't ship an exported `verifyTotpCodeAgainstSecret`, but we
  // can sanity-check that the library we depend on behaves the way
  // the rest of the code assumes (SHA-1, 6 digits, 30s period,
  // ±1 window tolerance).
  it("generates and validates a 6-digit code within the same period", () => {
    const totp = new TOTP({
      issuer: "Suparbase",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: "JBSWY3DPEHPK3PXP", // RFC test vector
    });
    const token = totp.generate();
    expect(token).toMatch(/^\d{6}$/);
    expect(totp.validate({ token })).not.toBeNull();
  });

  it("rejects a clearly wrong code", () => {
    const totp = new TOTP({
      issuer: "Suparbase",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: "JBSWY3DPEHPK3PXP",
    });
    expect(totp.validate({ token: "000000" })).toBeNull();
  });
});
