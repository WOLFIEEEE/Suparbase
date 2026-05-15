/**
 * Site-wide SEO constants. Imported by metadata exports, JSON-LD,
 * sitemap, robots, and Open Graph helpers.
 *
 * URL resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  (preferred, explicit canonical)
 *   2. AUTH_URL              (legacy compat)
 *   3. https://suparbase.com (fallback)
 *
 * Localhost values are rejected so dev builds can't poison the
 * deployed sitemap / robots / canonical metadata.
 *
 * The version is read straight from package.json at build time so
 * there's a single source of truth, bumping package.json updates
 * every footer, badge, and JSON-LD reference automatically.
 */

import pkg from "../../../package.json";

const FALLBACK_URL = "https://suparbase.com";

function resolveSiteUrl(): string {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.AUTH_URL];
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = c.replace(/\/$/, "");
    if (/^https?:\/\/localhost/i.test(trimmed) || /^https?:\/\/127\./.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return FALLBACK_URL;
}

export const SITE = {
  name: "Suparbase",
  tagline: "An authenticated admin workspace for any Supabase project.",
  description:
    "Suparbase is an admin workspace for Supabase: encrypted credentials, server-side PostgREST proxy, RLS debugger, SQL playground, AI chat with diff-confirmed writes, row history, and Storage / Auth-users management. Free tier for solo projects.",
  url: resolveSiteUrl(),
  twitter: "@suparbase",
  version: pkg.version,
  authorName: "Suparbase",
  authorUrl: `${resolveSiteUrl()}/about`,
} as const;

/** Always reads env at call time. Use this in dynamic routes. */
export function getSiteUrl(): string {
  return resolveSiteUrl();
}

export function absoluteUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${cleaned}`;
}
