import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeOutboundUrl,
  assertSafePostgresConnectionString,
} from "@/server/security/egress";

const ORIGINAL_OVERRIDE = process.env.ALLOW_PRIVATE_EGRESS;

afterEach(() => {
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.ALLOW_PRIVATE_EGRESS;
  else process.env.ALLOW_PRIVATE_EGRESS = ORIGINAL_OVERRIDE;
});

describe("outbound URL enforcement", () => {
  it.each([
    "http://127.0.0.1:3000",
    "http://10.1.2.3/hook",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://203.0.113.10/",
  ])("rejects private and reserved literal addresses: %s", async (url) => {
    await expect(assertSafeOutboundUrl(url)).rejects.toThrow();
  });

  it("allows a globally routable literal address", async () => {
    await expect(assertSafeOutboundUrl("https://8.8.8.8/hook")).resolves.toMatchObject({
      protocol: "https:",
      hostname: "8.8.8.8",
    });
  });

  it("rejects embedded credentials and unsupported protocols", async () => {
    await expect(assertSafeOutboundUrl("https://user:secret@8.8.8.8/")).rejects.toThrow();
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("supports an explicit private-network override for self-hosted deployments", async () => {
    process.env.ALLOW_PRIVATE_EGRESS = "true";
    await expect(assertSafeOutboundUrl("http://10.1.2.3/hook")).resolves.toMatchObject({
      hostname: "10.1.2.3",
    });
    // Metadata and localhost names remain blocked even with the override.
    await expect(assertSafeOutboundUrl("http://metadata.google.internal/")).rejects.toThrow();
  });

  it("revalidates credential-bearing Postgres URLs before connecting", async () => {
    await expect(
      assertSafePostgresConnectionString("postgres://user:secret@127.0.0.1:5432/app"),
    ).rejects.toThrow();
    await expect(
      assertSafePostgresConnectionString("postgres://user:secret@8.8.8.8:5432/app"),
    ).resolves.toContain("8.8.8.8");
  });
});
