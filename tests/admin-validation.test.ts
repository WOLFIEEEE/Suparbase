import { describe, expect, it } from "vitest";
import { parseGrantExpiry } from "@/server/admin/validation";

describe("parseGrantExpiry", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");

  it("allows an open-ended grant", () => {
    expect(parseGrantExpiry(undefined, now)).toEqual({ ok: true, value: null });
  });

  it("uses the end of the selected UTC day", () => {
    const result = parseGrantExpiry("2026-12-31", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("rejects malformed and normalized calendar dates", () => {
    expect(parseGrantExpiry("31-12-2026", now).ok).toBe(false);
    expect(parseGrantExpiry("2026-02-31", now).ok).toBe(false);
    expect(parseGrantExpiry("2026-13-01", now).ok).toBe(false);
  });

  it("rejects expired grants but permits the remainder of today", () => {
    expect(parseGrantExpiry("2026-07-15", now).ok).toBe(false);
    expect(parseGrantExpiry("2026-07-16", now).ok).toBe(true);
  });
});
