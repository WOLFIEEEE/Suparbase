import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site";
import { listArticles } from "@/lib/blog/articles";
import { listUseCases } from "@/lib/use-cases/registry";
import { listCompare } from "@/lib/compare/registry";
import { listGuides } from "@/lib/guides/registry";
import { listLearn } from "@/lib/learn/registry";
import { TOOLS } from "@/lib/tools/registry";

// Resolve env at request time so the deployed sitemap can't bake in
// a stale/localhost URL from build time.
export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/agent-sentry", priority: 0.92, changeFrequency: "monthly" },
  { path: "/tools", priority: 0.85, changeFrequency: "monthly" },
  ...TOOLS.map((t) => ({
    path: `/tools/${t.slug}`,
    priority: 0.82,
    changeFrequency: "monthly" as const,
  })),
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.9, changeFrequency: "monthly" },
  { path: "/docs/api", priority: 0.7, changeFrequency: "monthly" },
  { path: "/guides", priority: 0.85, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { path: "/use-cases", priority: 0.8, changeFrequency: "monthly" },
  { path: "/compare", priority: 0.8, changeFrequency: "monthly" },
  { path: "/learn", priority: 0.7, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/roadmap", priority: 0.6, changeFrequency: "weekly" },
  { path: "/status", priority: 0.4, changeFrequency: "daily" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/accessibility", priority: 0.4, changeFrequency: "monthly" },
  { path: "/accessibility/vpat", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = getSiteUrl();

  const staticEntries = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const articleEntries = listArticles().map((a) => ({
    url: `${base}/blog/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : new Date(a.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const useCaseEntries = listUseCases().map((u) => ({
    url: `${base}/use-cases/${u.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const compareEntries = listCompare().map((c) => ({
    url: `${base}/compare/${c.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  const guideEntries = listGuides().map((g) => ({
    url: `${base}/guides/${g.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.78,
  }));

  const learnEntries = listLearn().map((e) => ({
    url: `${base}/learn/${e.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  return [
    ...staticEntries,
    ...articleEntries,
    ...useCaseEntries,
    ...compareEntries,
    ...guideEntries,
    ...learnEntries,
  ];
}
