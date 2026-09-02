import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { csrfOr403 } from "@/server/security/route-guards";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(origin?: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest("https://app.example.com/api/write", {
    method: "POST",
    headers,
  });
}

describe("CSRF route guard", () => {
  it("accepts the configured production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    expect(csrfOr403(request("https://app.example.com", "session=1"))).toBeNull();
  });

  it("rejects a cross-site production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    expect(csrfOr403(request("https://attacker.example", "session=1"))?.status).toBe(403);
  });

  it("fails closed for cookie-authenticated writes without Origin", () => {
    expect(csrfOr403(request(undefined, "session=1"))?.status).toBe(403);
  });

  it("allows the actual localhost origin in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    const dev = new NextRequest("http://localhost:3000/api/write", {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: "session=1" },
    });
    expect(csrfOr403(dev)).toBeNull();
  });
});
