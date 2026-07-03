import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Timing-safe check of the `Authorization: Bearer <CRON_SECRET>` contract
 * shared by every cron route. Hashing both sides first makes the comparison
 * length-independent, so neither content nor length leaks through timing.
 */
export function verifyCronAuth(header: string | null, secret: string): boolean {
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const provided = createHash("sha256")
    .update(header ?? "")
    .digest();
  return timingSafeEqual(expected, provided);
}
