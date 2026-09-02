import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { AppError } from "@/lib/errors";

// Keep address families in separate BlockLists. Node treats IPv4 addresses as
// IPv4-mapped IPv6 during checks, so mixing `::ffff:0:0/96` into one list would
// accidentally classify every ordinary IPv4 address as blocked.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();

// Non-public IPv4 ranges: unspecified, private, loopback, link-local,
// carrier-grade NAT, benchmarking, multicast, and reserved space.
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "instance-data",
  "169.254.169.254",
]);

function privateEgressAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_EGRESS === "true";
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) return blockedV6.check(address, "ipv6");
  return true;
}

/**
 * Resolve an outbound host immediately before use and reject every address
 * that is not globally routable. Operators of isolated self-hosted installs
 * can explicitly opt into private egress with ALLOW_PRIVATE_EGRESS=true.
 */
export async function assertSafeOutboundUrl(
  raw: string | URL,
  allowedProtocols: ReadonlySet<string> = new Set(["https:", "http:"]),
  options: { allowCredentials?: boolean } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw) : new URL(raw);
  } catch {
    throw new AppError("validation", "Outbound URL is invalid.");
  }
  if (!allowedProtocols.has(url.protocol)) {
    throw new AppError("validation", "Outbound URL uses an unsupported protocol.");
  }
  if (!options.allowCredentials && (url.username || url.password)) {
    throw new AppError("validation", "Credentials must not be embedded in an outbound URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || METADATA_HOSTS.has(host) || host === "localhost" || host.endsWith(".localhost")) {
    throw new AppError("validation", "Outbound URL must not target a local or metadata service.");
  }
  if (privateEgressAllowed()) return url;

  const literalFamily = isIP(host);
  const addresses = literalFamily
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new AppError("network", "Outbound host could not be resolved safely.");
      });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new AppError("validation", "Outbound URL resolves to a private or reserved network.");
  }
  return url;
}

/** Validate a user-supplied Direct Postgres URL immediately before connect. */
export async function assertSafePostgresConnectionString(raw: string): Promise<string> {
  await assertSafeOutboundUrl(raw, new Set(["postgres:", "postgresql:"]), {
    allowCredentials: true,
  });
  return raw;
}

/** Fetch with DNS validation and explicit, revalidated redirect handling. */
export async function hardenedFetch(
  raw: string | URL,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let current = await assertSafeOutboundUrl(raw);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(current, {
      ...init,
      method,
      body,
      headers,
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects >= maxRedirects) {
      throw new AppError("network", "Outbound request exceeded the redirect limit.");
    }
    const location = response.headers.get("location");
    if (!location) throw new AppError("network", "Outbound redirect did not include a destination.");
    const next = await assertSafeOutboundUrl(new URL(location, current));
    if (next.origin !== current.origin) {
      headers = new Headers(headers);
      headers.delete("authorization");
      headers.delete("cookie");
      headers.delete("proxy-authorization");
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
      headers.delete("content-length");
    }
    current = next;
  }
}
