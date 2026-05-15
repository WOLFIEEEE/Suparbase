import { describe, expect, it } from "vitest";
import { validateWebhookUrl } from "@/server/actions/repo";

/**
 * SSRF blocklist for custom-action webhook URLs. Every entry below
 * corresponds to a real attack vector or a known internal endpoint
 * we don't want exposed to an action invocation:
 *
 *   - 169.254.169.254 — AWS / GCP / Oracle / DO cloud metadata
 *   - metadata.google.internal / metadata.azure.com — DNS-named metadata
 *   - 127.x / ::1 — loopback (IPv4 + IPv6)
 *   - 10.x / 192.168.x / 172.16-31.x — RFC1918 private
 *   - 169.254.x — link-local (covers AWS metadata + IPv4 link-local)
 *   - fe80:: — IPv6 link-local
 *   - fc00:: / fd00:: — IPv6 unique local
 *   - 0.0.0.0 — wildcard
 *
 * The tests pin the blocklist shape so a future contributor can't
 * accidentally drop one of these rules.
 */

const BLOCKED = [
  // Cloud metadata
  "http://169.254.169.254/latest/meta-data/",
  "https://metadata.google.internal/computeMetadata/v1/",
  "http://metadata.azure.com/metadata/instance",
  "https://instance-data",
  // Loopback v4
  "http://127.0.0.1:8080",
  "http://127.5.5.5",
  "http://localhost/api",
  "http://0.0.0.0:3000",
  // Loopback v6
  "http://[::1]/",
  "http://[::]/",
  "http://[::ffff:127.0.0.1]/",
  // Link-local + ULA v6
  "http://[fe80::1]/",
  "http://[fc00::abcd]/",
  "http://[fd12:3456:789a::1]/",
  // RFC1918
  "http://10.0.0.1/",
  "http://192.168.1.1/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://169.254.5.5/",
] as const;

const ALLOWED = [
  "https://api.example.com/webhook",
  "https://hooks.slack.com/services/T0/B0/abc",
  "https://api.stripe.com/v1/refunds",
  // Public CGN range — annoying, but technically not in any private block.
  // We don't try to defend against carrier-grade NAT.
  "https://203.0.113.5/",
  // 172.32+ is public.
  "http://172.32.0.1/",
] as const;

describe("validateWebhookUrl · blocked", () => {
  it.each(BLOCKED)("rejects %s", (url) => {
    expect(() => validateWebhookUrl(url)).toThrow();
  });
});

describe("validateWebhookUrl · allowed", () => {
  it.each(ALLOWED)("permits %s", (url) => {
    expect(() => validateWebhookUrl(url)).not.toThrow();
  });
});

describe("validateWebhookUrl · scheme", () => {
  it("rejects file: and javascript: schemes", () => {
    expect(() => validateWebhookUrl("file:///etc/passwd")).toThrow();
    expect(() => validateWebhookUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => validateWebhookUrl("not a url")).toThrow();
    expect(() => validateWebhookUrl("")).toThrow();
  });
});
