import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Tag } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd, breadcrumbLd, websiteLd } from "@/components/public/JsonLd";
import { listArticles } from "@/lib/blog/articles";
import { SITE, absoluteUrl } from "@/lib/seo/site";

const title = "The Suparbase Blog: Postgres, Supabase, and AI-assisted database operations";
const description =
  "Long-form technical writing on Postgres, Supabase, RLS, multi-tenancy, RAG, AI-assisted database admin, and connection pooling. Practical, opinionated, written by operators.";

export const metadata: Metadata = {
  title: "Blog · Suparbase",
  description,
  alternates: { canonical: absoluteUrl("/blog") },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/blog"),
    siteName: SITE.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function BlogHubPage() {
  const articles = listArticles();
  return (
    <PublicLayout>
      <JsonLd data={websiteLd()} />
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
        ])}
      />
      <PageShell>
        <PageHeader
          eyebrow="Blog"
          title={
            <>
              Long-form writing on Postgres,
              <br className="hidden sm:inline" /> Supabase, and AI-assisted ops.
            </>
          }
          subtitle="Practical, opinionated articles by the same team that builds Suparbase. We write about what we ship and what we see in production."
        />

        <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {articles.map((a, i) => (
            <li key={a.slug} className={i === 0 ? "md:col-span-2" : undefined}>
              <ArticleCard
                meta={a}
                size={i === 0 ? "lead" : "regular"}
              />
            </li>
          ))}
        </ul>

        <p className="mt-12 text-xs text-fg-faint">
          We publish on average two long-form articles per month. Subscribe via
          your favourite RSS reader at{" "}
          <code>{SITE.url}/rss.xml</code> (coming Q3 2026).
        </p>
      </PageShell>
    </PublicLayout>
  );
}

interface ArticleCardProps {
  meta: ReturnType<typeof listArticles>[number];
  size: "lead" | "regular";
}

function ArticleCard({ meta, size }: ArticleCardProps) {
  const date = new Date(meta.publishedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <Link
      href={`/blog/${meta.slug}`}
      className="group block h-full rounded-lg border hairline bg-bg-raised p-6 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        <BookOpen className="h-3 w-3" aria-hidden />
        <time dateTime={meta.publishedAt}>{date}</time>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden /> {meta.readingMinutes} min
        </span>
      </div>
      <h2
        className={
          size === "lead"
            ? "mt-4 font-display text-2xl leading-tight md:text-3xl"
            : "mt-3 font-display text-xl leading-tight"
        }
      >
        {meta.title}
      </h2>
      <p
        className={
          size === "lead"
            ? "mt-3 max-w-3xl text-base leading-relaxed text-fg-muted"
            : "mt-2 text-sm leading-relaxed text-fg-muted"
        }
      >
        {meta.description}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-1.5">
          {meta.tags.slice(0, 4).map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-full border hairline bg-bg-sunken/60 px-2 py-0.5 text-[10px] text-fg-muted"
            >
              <Tag className="h-2.5 w-2.5 text-fg-faint" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <span className="inline-flex items-center gap-1 text-xs text-fg-faint transition-colors group-hover:text-accent">
          Read article
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
