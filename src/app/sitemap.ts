import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/site";
import { listArticles } from "@/lib/blog/articles";
import { listUseCases } from "@/lib/use-cases/registry";
import { listCompare } from "@/lib/compare/registry";
import { listGuides } from "@/lib/guides/registry";

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.9, changeFrequency: "monthly" },
  { path: "/guides", priority: 0.85, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { path: "/use-cases", priority: 0.8, changeFrequency: "monthly" },
  { path: "/compare", priority: 0.8, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries = STATIC_ROUTES.map((r) => ({
    url: `${SITE.url}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const articleEntries = listArticles().map((a) => ({
    url: `${SITE.url}/blog/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : new Date(a.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const useCaseEntries = listUseCases().map((u) => ({
    url: `${SITE.url}/use-cases/${u.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const compareEntries = listCompare().map((c) => ({
    url: `${SITE.url}/compare/${c.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  const guideEntries = listGuides().map((g) => ({
    url: `${SITE.url}/guides/${g.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.78,
  }));

  return [
    ...staticEntries,
    ...articleEntries,
    ...useCaseEntries,
    ...compareEntries,
    ...guideEntries,
  ];
}
