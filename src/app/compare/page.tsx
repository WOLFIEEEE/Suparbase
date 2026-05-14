import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { listCompare } from "@/lib/compare/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

const title = "Database & platform comparisons · Suparbase";
const description =
  "Side-by-side comparisons of the databases and platforms we get asked about: Supabase vs Firebase, Postgres vs MongoDB, Supabase vs Neon. Honest takes, no fluff.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/compare") },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/compare"),
    siteName: SITE.name,
    type: "website",
  },
};

export default async function CompareHubPage() {
  const items = listCompare();
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Compare", href: "/compare" },
        ])}
      />
      <PageShell>
        <PageHeader
          eyebrow="Compare"
          title={
            <>
              The comparisons we
              <br className="hidden sm:inline" /> get asked about.
            </>
          }
          subtitle="Head-to-head picks where we lay out what each side actually does and which one we'd pick for which shape of project. No magic quadrants, no false equivalences."
        />

        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-6 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
              >
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                    <GitCompareArrows className="h-3 w-3" aria-hidden />
                    Head to head
                  </div>
                  <h2 className="font-display text-xl leading-tight">
                    <span>{c.leftName}</span>
                    <span className="mx-2 text-fg-faint">vs</span>
                    <span>{c.rightName}</span>
                  </h2>
                  <p className="text-sm leading-relaxed text-fg-muted">{c.tldr}</p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1 text-xs text-fg-faint transition-colors group-hover:text-accent">
                  Read comparison <ArrowRight className="h-3 w-3" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageShell>
    </PublicLayout>
  );
}
