import "server-only";

export type GrantExpiryResult =
  | { ok: true; value: Date | null }
  | { ok: false; message: string };

/** Parse an optional YYYY-MM-DD grant cliff as the end of that UTC day. */
export function parseGrantExpiry(value: string | undefined, now = new Date()): GrantExpiryResult {
  if (!value) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { ok: false, message: "Expiry must use YYYY-MM-DD." };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const expiry = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (
    expiry.getUTCFullYear() !== year ||
    expiry.getUTCMonth() !== month - 1 ||
    expiry.getUTCDate() !== day
  ) {
    return { ok: false, message: "Expiry must be a real calendar date." };
  }
  if (expiry.getTime() <= now.getTime()) {
    return { ok: false, message: "Expiry must be a future date." };
  }
  return { ok: true, value: expiry };
}
