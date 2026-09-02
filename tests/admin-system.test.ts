import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdminSystemChecks } from "@/server/admin/system";

const KEYS = [
  "SUPARBASE_ENCRYPTION_KEY",
  "SUPARBASE_ENCRYPTION_KEY_OLD",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "RESEND_WEBHOOK_SECRET",
  "DODO_API_KEY",
  "DODO_WEBHOOK_SECRET",
  "DODO_MODE",
  "CRON_SECRET",
  "SENTRY_DSN",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "NEXT_PUBLIC_POSTHOG_KEY",
] as const;
const original = new Map(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
});
afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getAdminSystemChecks", () => {
  it("reports required missing configuration without exposing values", () => {
    const checks = getAdminSystemChecks();
    expect(checks.find((check) => check.id === "vault")?.state).toBe("warn");
    expect(checks.find((check) => check.id === "billing-webhook")?.state).toBe("off");
    expect(checks.find((check) => check.id === "oauth")?.state).toBe("off");
    expect(JSON.stringify(checks)).not.toContain("undefined");
  });

  it("recognizes a fully configured operational deployment", () => {
    process.env.SUPARBASE_ENCRYPTION_KEY = "primary-secret";
    process.env.RESEND_API_KEY = "resend-secret";
    process.env.EMAIL_FROM = "Suparbase <ops@example.com>";
    process.env.RESEND_WEBHOOK_SECRET = "resend-webhook";
    process.env.DODO_API_KEY = "dodo-secret";
    process.env.DODO_WEBHOOK_SECRET = "dodo-webhook";
    process.env.CRON_SECRET = "cron-secret";
    process.env.SENTRY_DSN = "sentry-secret";
    process.env.AUTH_GITHUB_ID = "github-id";
    process.env.AUTH_GITHUB_SECRET = "github-secret";
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "posthog-key";
    const checks = getAdminSystemChecks();
    expect(checks.filter((check) => check.state === "warn")).toHaveLength(0);
    expect(checks.find((check) => check.id === "billing")?.state).toBe("ok");
    expect(checks.find((check) => check.id === "email")?.state).toBe("ok");
  });

  it("requires webhook verification whenever billing checkout is enabled", () => {
    process.env.DODO_API_KEY = "dodo-secret";
    const webhook = getAdminSystemChecks().find((check) => check.id === "billing-webhook");
    expect(webhook?.state).toBe("warn");
    expect(webhook?.importance).toBe("required");
  });

  it("signals an active vault rotation without revealing either key", () => {
    process.env.SUPARBASE_ENCRYPTION_KEY = "new-key-value";
    process.env.SUPARBASE_ENCRYPTION_KEY_OLD = "old-key-value";
    const vault = getAdminSystemChecks().find((check) => check.id === "vault");
    expect(vault?.state).toBe("ok");
    expect(vault?.detail).toContain("rotation window");
    expect(vault?.detail).not.toContain("new-key-value");
    expect(vault?.detail).not.toContain("old-key-value");
  });
});
