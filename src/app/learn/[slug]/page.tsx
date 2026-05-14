import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageShell, Prose } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { getLearn, listLearn } from "@/lib/learn/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listLearn().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const e = getLearn(slug);
  if (!e) return { title: "Not found · Suparbase", robots: { index: false, follow: false } };
  const url = absoluteUrl(`/learn/${slug}`);
  return {
    title: e.title ?? `${e.term} explained · Suparbase`,
    description: e.description,
    alternates: { canonical: url },
    openGraph: {
      title: e.term,
      description: e.description,
      url,
      siteName: SITE.name,
      type: "article",
    },
  };
}

function relatedHref(r: { kind: "blog" | "guide" | "compare"; slug: string }) {
  if (r.kind === "blog") return `/blog/${r.slug}`;
  if (r.kind === "guide") return `/guides/${r.slug}`;
  return `/compare/${r.slug}`;
}

const KIND_LABEL: Record<string, string> = {
  blog: "Article",
  guide: "Guide",
  compare: "Comparison",
};

export default async function LearnEntryPage({ params }: Params) {
  const { slug } = await params;
  const e = getLearn(slug);
  if (!e) notFound();
  const Body = e.body;
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Learn", href: "/learn" },
          { label: e.term, href: `/learn/${e.slug}` },
        ])}
      />
      <PageShell>
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All terms
        </Link>

        <header className="mt-6 space-y-3">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <BookOpen className="h-3 w-3" aria-hidden />
            {e.category}
          </div>
          <h1 className="font-display text-3xl leading-[1.05] sm:text-4xl md:text-5xl">{e.term}</h1>
        </header>

        <div className="mt-10 max-w-3xl">
          <Prose>
            <Body />
          </Prose>
        </div>

        {e.related && e.related.length > 0 && (
          <section className="mt-14 border-t hairline pt-10">
            <h2 className="font-display text-xl">Read further</h2>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {e.related.map((r) => (
                <li key={`${r.kind}-${r.slug}`}>
                  <Link
                    href={relatedHref(r)}
                    className="group flex h-full items-center justify-between gap-3 rounded-lg border hairline bg-bg-raised px-4 py-3 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
                  >
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="block font-display text-base leading-tight">{r.label}</span>
                    </span>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageShell>
    </PublicLayout>
  );
}
