/**
 * Site-wide SEO constants. Imported by metadata exports, JSON-LD,
 * sitemap, robots, and Open Graph helpers.
 */

export const SITE = {
  name: "Suparbase",
  tagline: "An authenticated admin workspace for any Supabase project.",
  description:
    "Suparbase is an open-source Supabase admin: encrypted credentials, server-side PostgREST proxy, RLS debugger, SQL playground, AI chat with diff-confirmed writes, row history, and Storage / Auth-users management. Self-host free under MIT.",
  url: (process.env.AUTH_URL ?? "https://suparbase.dev").replace(/\/$/, ""),
  twitter: "@suparbase",
  github: "https://github.com/WOLFIEEEE/Suparbase",
  version: "1.5.0",
  authorName: "Suparbase",
  authorUrl: "https://suparbase.dev/about",
} as const;

export function absoluteUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${cleaned}`;
}
