import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { listLearn } from "@/lib/learn/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

const title = "Learn · Suparbase glossary";
const description =
  "Short, dense definitions of the database and AI concepts that show up across our blog: RLS, JSONB, MVCC, RAG, HNSW, pgvector, connection pooling, vibe coding.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/learn") },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/learn"),
    siteName: SITE.name,
    type: "website",
  },
};

export default async function LearnHubPage() {
  const entries = listLearn();
  const byCategory = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Learn", href: "/learn" },
        ])}
      />
      <PageShell>
        <PageHeader
          eyebrow="Learn"
          title="A glossary, not a textbook."
          subtitle="Short definitions of the database and AI concepts our articles assume. Each one is a couple of paragraphs, with links to the deeper pieces."
        />

        <div className="mt-12 space-y-10">
          {Object.entries(byCategory).map(([category, list]) => (
            <section key={category}>
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                {category}
              </h2>
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {list.map((e) => (
                  <li key={e.slug}>
                    <Link
                      href={`/learn/${e.slug}`}
                      className="group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
                    >
                      <div>
                        <h3 className="flex items-center gap-1.5 font-display text-base leading-tight">
                          <BookOpen className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
                          {e.term}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                          {e.description}
                        </p>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs text-fg-faint transition-colors group-hover:text-accent">
                        Read definition
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </PageShell>
    </PublicLayout>
  );
}
