import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageShell, Prose } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { getCompare, listCompare } from "@/lib/compare/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listCompare().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompare(slug);
  if (!c) return { title: "Not found · Suparbase", robots: { index: false, follow: false } };
  const url = absoluteUrl(`/compare/${slug}`);
  return {
    title: `${c.title} · Suparbase`,
    description: c.description,
    alternates: { canonical: url },
    openGraph: {
      title: c.title,
      description: c.description,
      url,
      siteName: SITE.name,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: c.title,
      description: c.description,
    },
  };
}

export default async function ComparePage({ params }: Params) {
  const { slug } = await params;
  const c = getCompare(slug);
  if (!c) notFound();
  const Body = c.body;
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Compare", href: "/compare" },
          { label: `${c.leftName} vs ${c.rightName}`, href: `/compare/${c.slug}` },
        ])}
      />

      <PageShell>
        <Link
          href="/compare"
          className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All comparisons
        </Link>

        <header className="mt-6 space-y-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">
            Comparison
          </div>
          <h1 className="font-display text-3xl leading-[1.05] sm:text-4xl md:text-5xl">
            <span>{c.leftName}</span>
            <span className="mx-3 text-fg-faint">vs</span>
            <span>{c.rightName}</span>
          </h1>
        </header>

        {/* TL;DR card */}
        <section className="mt-8 rounded-lg border hairline bg-bg-raised/40 p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">TL;DR</p>
          <p className="mt-2 text-base leading-relaxed text-fg md:text-lg">{c.tldr}</p>
          {c.callouts && c.callouts.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {c.callouts.map((co) => (
                <li
                  key={co.context}
                  className="rounded border hairline bg-bg-raised px-3 py-2 text-xs"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                    {co.context}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-fg">
                    <Check className="h-3 w-3 text-accent" aria-hidden />
                    <span className="font-medium">{co.winner}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Feature matrix */}
        <section className="mt-10 overflow-hidden rounded-lg border hairline">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b hairline bg-bg-raised text-left">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                    Feature
                  </th>
                  <th className="px-4 py-3 text-sm font-display">{c.leftName}</th>
                  <th className="px-4 py-3 text-sm font-display">{c.rightName}</th>
                </tr>
              </thead>
              <tbody>
                {c.matrix.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={cn(
                      "border-b hairline last:border-b-0",
                      i % 2 === 1 && "bg-bg-raised/30",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-fg">{row.feature}</td>
                    <td className="px-4 py-3 text-fg-muted">{row.left}</td>
                    <td className="px-4 py-3 text-fg-muted">{row.right}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Body content */}
        <div className="mt-12 max-w-3xl">
          <Prose>
            <Body />
          </Prose>
        </div>

        {/* Other comparisons */}
        <OtherComparisons currentSlug={c.slug} />
      </PageShell>
    </PublicLayout>
  );
}

function OtherComparisons({ currentSlug }: { currentSlug: string }) {
  const others = listCompare().filter((c) => c.slug !== currentSlug);
  if (others.length === 0) return null;
  return (
    <section className="mt-16 border-t hairline pt-10">
      <h2 className="font-display text-xl">Other comparisons</h2>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {others.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/compare/${c.slug}`}
              className="group flex h-full items-center justify-between gap-3 rounded-lg border hairline bg-bg-raised px-4 py-3 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
            >
              <span className="min-w-0">
                <span className="block font-display text-base leading-tight">
                  {c.leftName}
                  <span className="mx-1.5 text-fg-faint">vs</span>
                  {c.rightName}
                </span>
              </span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
