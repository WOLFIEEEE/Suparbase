import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
