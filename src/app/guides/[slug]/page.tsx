import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Clock, Tag, Timer } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageShell, Prose } from "@/components/public/sections";
import { JsonLd, breadcrumbLd, articleLd } from "@/components/public/JsonLd";
import { getGuide, listGuides } from "@/lib/guides/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: "Not found · Suparbase", robots: { index: false, follow: false } };
  const url = absoluteUrl(`/guides/${slug}`);
  return {
    title: `${g.title} · Suparbase`,
    description: g.description,
    keywords: [...g.tags],
    alternates: { canonical: url },
    openGraph: {
      title: g.title,
      description: g.description,
      url,
      siteName: SITE.name,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: g.title,
      description: g.description,
    },
  };
}

const LEVEL_TONE: Record<string, string> = {
  Beginner: "bg-accent/10 text-accent",
  Intermediate: "bg-warn/10 text-warn",
  Advanced: "bg-danger/10 text-danger",
};

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const Body = g.body;

  return (
    <PublicLayout>
      <JsonLd
        data={articleLd({
          slug: g.slug,
          title: g.title,
          description: g.description,
          datePublished: "2026-05-14",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
          { label: g.title, href: `/guides/${g.slug}` },
        ])}
      />

      <PageShell>
        <Link
          href="/guides"
          className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All guides
        </Link>

        <header className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            <span className="inline-flex items-center gap-1 text-fg-faint">
              <BookOpen className="h-3 w-3" aria-hidden /> Guide
            </span>
            <span className={`rounded-full px-2 py-0.5 ${LEVEL_TONE[g.level] ?? ""}`}>
              {g.level}
            </span>
            {g.tags.slice(0, 4).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-fg-muted">
                <Tag className="h-3 w-3 text-fg-faint" aria-hidden />
                {t}
              </span>
            ))}
          </div>

          <h1 className="font-display text-3xl leading-[1.05] sm:text-4xl md:text-5xl">{g.title}</h1>
          <p className="max-w-3xl text-base leading-relaxed text-fg-muted md:text-lg">
            {g.description}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-faint">
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3 w-3" aria-hidden /> {g.timeMinutes} min to complete
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> {g.readingMinutes} min read
            </span>
          </div>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[14rem_1fr]">
          {g.steps.length > 0 && (
            <aside className="md:sticky md:top-20 md:self-start">
              <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">Steps</p>
              <nav>
                <ol className="space-y-1.5 border-l hairline pl-3 text-[13px]">
                  {g.steps.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={cn(
                          "block transition-colors text-fg-muted hover:text-accent",
                        )}
                      >
                        <span className="mr-1.5 font-mono text-[10px] text-fg-faint">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          )}
          <div className="min-w-0">
            <Prose>
              <Body />
            </Prose>

            <div className="mt-14 border-t hairline pt-10">
              <h2 className="font-display text-xl">More guides</h2>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {listGuides()
                  .filter((other) => other.slug !== g.slug)
                  .slice(0, 4)
                  .map((other) => (
                    <li key={other.slug}>
                      <Link
                        href={`/guides/${other.slug}`}
                        className="group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
                      >
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                            {other.level} · {other.timeMinutes}m
                          </div>
                          <h3 className="mt-1.5 font-display text-base leading-tight">
                            {other.title}
                          </h3>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
