import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminEmail, isAdminPanelEnabled } from "@/server/admin/guard";

/**
 * Admin allowlist parsing. The CSV in SUPARBASE_ADMIN_EMAILS is the
 * single source of truth - no `is_admin` column in the DB by design.
 *
 * The tests pin the case-insensitivity + whitespace tolerance + empty
 * string handling so a contributor doesn't accidentally regress them.
 */

const ORIGINAL = process.env.SUPARBASE_ADMIN_EMAILS;

beforeEach(() => {
  delete process.env.SUPARBASE_ADMIN_EMAILS;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SUPARBASE_ADMIN_EMAILS;
  else process.env.SUPARBASE_ADMIN_EMAILS = ORIGINAL;
});

describe("isAdminEmail", () => {
  it("returns false when env is unset", () => {
    expect(isAdminEmail("a@b.com")).toBe(false);
  });
  it("returns false when env is empty string", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "";
    expect(isAdminEmail("a@b.com")).toBe(false);
  });
  it("matches a single email case-insensitively", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "Ops@Example.com";
    expect(isAdminEmail("ops@example.com")).toBe(true);
    expect(isAdminEmail("OPS@EXAMPLE.COM")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });
  it("handles CSV with surrounding whitespace", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = " a@b.com ,  c@d.com  ,e@f.com";
    expect(isAdminEmail("c@d.com")).toBe(true);
    expect(isAdminEmail("e@f.com")).toBe(true);
  });
  it("ignores entries without @", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "not-an-email,real@email.com";
    expect(isAdminEmail("not-an-email")).toBe(false);
    expect(isAdminEmail("real@email.com")).toBe(true);
  });
  it("returns false for null/undefined/empty input", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "a@b.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});

describe("isAdminPanelEnabled", () => {
  it("false when env is missing", () => {
    expect(isAdminPanelEnabled()).toBe(false);
  });
  it("false when env contains only invalid entries", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "no-at-symbol,still-none";
    expect(isAdminPanelEnabled()).toBe(false);
  });
  it("true when at least one valid email is configured", () => {
    process.env.SUPARBASE_ADMIN_EMAILS = "kgp@example.com";
    expect(isAdminPanelEnabled()).toBe(true);
  });
});
