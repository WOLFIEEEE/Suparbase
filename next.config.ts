import type { NextConfig } from "next";

/**
 * Security headers (CSP + HSTS + X-Frame-Options + the rest) are set
 * in `src/middleware.ts` per request so the CSP can include a fresh
 * `nonce-` value on every response. Setting them here as well would
 * either duplicate the header or fight the middleware-set value
 * depending on the runtime. The middleware matcher covers every
 * request that produces an HTML page.
 */
const config: NextConfig = {
  // Produce a self-contained .next/standalone output so the runtime image
  // only needs the minimal node_modules subset Next.js actually uses.
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
  typedRoutes: false,
};

export default config;
