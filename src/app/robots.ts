import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site";

// Resolve env at request time so the deployed robots.txt can't bake
// in a stale/localhost URL from build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/c/",
          "/connections",
          "/connections/",
          "/settings",
          "/settings/",
          "/signin",
          "/signup",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
