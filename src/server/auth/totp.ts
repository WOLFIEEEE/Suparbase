import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { recoveryCodes, users } from "@/server/schema";
import { encryptKey, decryptKey } from "@/server/crypto/vault";

/**
 * Two-factor authentication via TOTP (RFC 6238). The secret is
 * generated server-side, encrypted with the vault key, and stored
 * on `users.totp_secret_encrypted`. 10 recovery codes are generated
 * at enable time, SHA-256 hashed, and persisted in
 * `user_recovery_code`. The plaintext codes are shown to the user
 * exactly once.
 *
 * Verification accepts the current 30-second window plus a single
 * window of clock skew on either side - total tolerance is ~90s.
 *
 * Issuer label is "Suparbase" so authenticator apps group entries.
 */

const ISSUER = "Suparbase";
const RECOVERY_CODE_COUNT = 10;

export interface SetupResult {
  /** Plaintext base32 secret, only returned in the setup response. */
  secret: string;
  /** otpauth:// URL the user scans. */
  otpauthUrl: string;
  /** SVG data URL of the QR. Convenient for `<img src="...">`. */
  qrSvgDataUrl: string;
}

/**
 * Generate a fresh TOTP secret + the QR for the user. Doesn't
 * persist anything - the caller commits via `enable2FA` after the
 * user proves they scanned it by submitting a valid code.
 */
export async function generate2FASetup(email: string): Promise<SetupResult> {
  // 20 random bytes → 32-char base32. Standard length for TOTP.
  const secretBytes = randomBytes(20);
  // Secret accepts ArrayBuffer (otpauth's typing); copy the
  // Node Buffer into a fresh ArrayBuffer to satisfy the typing.
  const buf = new ArrayBuffer(secretBytes.length);
  new Uint8Array(buf).set(secretBytes);
  const secret = new Secret({ buffer: buf }).base32;

  const totp = new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  const otpauthUrl = totp.toString();

  // Render the QR as inline SVG data URL - small (<2 KB) and works
  // inside emails / dark-mode / no external requests.
  const qrSvg = await QRCode.toString(otpauthUrl, {
    type: "svg",
    margin: 0,
    color: { dark: "#111113", light: "#ffffff" },
  });
  const qrSvgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

  return { secret, otpauthUrl, qrSvgDataUrl };
}

/**
 * Activate 2FA. Validates the submitted code against the proposed
 * secret BEFORE persistence - if the user typed wrong, we don't
 * want to enable 2FA with a secret they can't reproduce.
 *
 * Returns the recovery codes (plaintext) on success. The caller
 * must show them to the user exactly once.
 */
export async function enable2FA(
  userId: string,
  secret: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; reason: "bad_code" }> {
  if (!verifyTotpCodeAgainstSecret(secret, code)) {
    return { ok: false, reason: "bad_code" };
  }
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashes = codes.map(hashRecoveryCode);

  await db.transaction(async (tx) => {
    // Wipe any stale recovery codes from a previous enrolment.
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(
      hashes.map((h) => ({ userId, codeHash: h })),
    );
    await tx
      .update(users)
      .set({
        totpSecretEncrypted: encryptKey(secret),
        totpEnabledAt: new Date(),
      })
      .where(eq(users.id, userId));
  });

  return { ok: true, recoveryCodes: codes };
}

/** Deactivate 2FA. Caller is responsible for re-auth (password). */
export async function disable2FA(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx
      .update(users)
      .set({ totpSecretEncrypted: null, totpEnabledAt: null })
      .where(eq(users.id, userId));
  });
}

/**
 * Verify a 6-digit code against the user's stored secret. Used by
 * the signin /signin/2fa step. Returns true on match.
 */
export async function verifyTotpForUser(userId: string, code: string): Promise<boolean> {
  const rows = await db
    .select({ secret: users.totpSecretEncrypted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const secretBlob = rows[0]?.secret;
  if (!secretBlob) return false;
  let secret: string;
  try {
    secret = decryptKey(secretBlob as Uint8Array);
  } catch {
    return false;
  }
  return verifyTotpCodeAgainstSecret(secret, code);
}

/**
 * Verify and consume a recovery code (one-time use). On success the
 * row's `consumed_at` is stamped and the code can't be reused.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const normalised = normalizeRecoveryCode(code);
  if (!normalised) return false;
  const hash = hashRecoveryCode(normalised);
  // Claim the code atomically. The consumed_at predicate prevents two
  // concurrent requests from redeeming the same recovery code.
  const claimed = await db
    .update(recoveryCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, hash),
        isNull(recoveryCodes.consumedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return claimed.length === 1;
}

/** How many recovery codes the user has left (unconsumed). */
export async function countRemainingRecoveryCodes(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(recoveryCodes)
    .where(eq(recoveryCodes.userId, userId));
  return rows.filter((r) => r.consumedAt == null).length;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Verify a 6-digit code against a base32 secret, accepting a single
 * window of clock skew on either side (~90s total tolerance).
 *
 * Constant-time comparison: otpauth's `.validate()` returns the
 * delta or null. We treat any non-null in `[-1, 0, 1]` as a match.
 */
function verifyTotpCodeAgainstSecret(secret: string, code: string): boolean {
  const cleaned = code.replace(/\s+/g, "").trim();
  if (!/^[0-9]{6}$/.test(cleaned)) return false;
  try {
    const totp = new TOTP({
      issuer: ISSUER,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const delta = totp.validate({ token: cleaned, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generate human-readable recovery codes: 10 chars total, split by
 * a dash for readability (e.g. `AB12-CD34-EF`). Uppercase alphanumeric
 * minus the visually-confusing chars (0/O, 1/I/L).
 */
function generateRecoveryCodes(count: number): string[] {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let s = "";
    for (let j = 0; j < 10; j++) {
      s += alphabet[bytes[j]! % alphabet.length];
    }
    // 4-4-2 grouping is easy to read aloud + type.
    out.push(`${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`);
  }
  return out;
}

/** Normalise user input: strip whitespace + dashes, uppercase. */
function normalizeRecoveryCode(input: string): string | null {
  const stripped = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z2-9]{10}$/.test(stripped)) return null;
  return stripped;
}

function hashRecoveryCode(plaintext: string): string {
  const normalised = normalizeRecoveryCode(plaintext) ?? plaintext.toUpperCase().replace(/[\s-]/g, "");
  return createHash("sha256").update(normalised).digest("hex");
}

/**
 * Signed-cookie helpers for the "mfa-verified" session marker.
 * Independent of NextAuth's JWT - the middleware checks both:
 *   1. JWT claims requires2FA
 *   2. cookie present + signature valid + not expired
 *
 * Using AUTH_SECRET (same value NextAuth signs with). HMAC-SHA256.
 */
const MFA_COOKIE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface MfaCookiePayload {
  userId: string;
  authAt: number;
  expiresAt: number;
}

export function signMfaCookie(userId: string, authAt = 0): string {
  const expiresAt = Date.now() + MFA_COOKIE_TTL_MS;
  const payload = `${userId}.${authAt}.${expiresAt}`;
  const sig = createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMfaCookie(value: string | undefined, userId: string, authAt = 0): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [cookieUserId, cookieAuthAtStr, expiresAtStr, sig] = parts;
  if (cookieUserId !== userId) return false;
  if (Number(cookieAuthAtStr) !== authAt) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = createHmac("sha256", getAuthSecret())
    .update(`${cookieUserId}.${cookieAuthAtStr}.${expiresAtStr}`)
    .digest("base64url");
  const a = Buffer.from(sig ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set; required for 2FA cookie signing.");
  return s;
}

/** Cookie name. Public so middleware can clear/read it. */
export const MFA_COOKIE_NAME = "suparbase-mfa-ok";
