import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure token helpers (no DB) so the format is unit-testable. A token is
 * `sbp_` + 32 random bytes as base64url (43 chars). Only the SHA-256 hex
 * is stored; the prefix keeps the first 12 chars for display.
 */

export const TOKEN_PREFIX = "sbp_";
const TOKEN_BODY_RE = /^[A-Za-z0-9_-]{43}$/;
export const DISPLAY_PREFIX_LENGTH = 12;

export interface GeneratedToken {
  plaintext: string;
  hash: string;
  prefix: string;
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(): GeneratedToken {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { plaintext, hash: hashToken(plaintext), prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/** True when the string has the exact shape of a Suparbase API token. */
export function isTokenShaped(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && TOKEN_BODY_RE.test(value.slice(TOKEN_PREFIX.length));
}

/** Extract a bearer token from an Authorization header, or null. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return isTokenShaped(m[1]!) ? m[1]! : null;
}

/** Constant-time compare of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
