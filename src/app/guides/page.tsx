import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Timer } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { listGuides } from "@/lib/guides/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

const title = "Guides · Suparbase";
const description =
  "Step-by-step tutorials for Postgres, Supabase, RLS, RAG, and multi-tenant SaaS. Copy-paste-able commands, no fluff.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/guides") },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/guides"),
    siteName: SITE.name,
    type: "website",
  },
};

const LEVEL_TONE: Record<string, string> = {
  Beginner: "bg-accent/10 text-accent",
  Intermediate: "bg-warn/10 text-warn",
  Advanced: "bg-danger/10 text-danger",
};

export default async function GuidesHubPage() {
  const guides = listGuides();
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
        ])}
      />
      <PageShell>
        <PageHeader
          eyebrow="Guides"
          title={
            <>
              Step-by-step tutorials.
              <br className="hidden sm:inline" /> Copy, paste, ship.
            </>
          }
          subtitle="Different from the blog. Guides are concrete recipes: paste these commands, get this result. Anything you might Google before lunch."
        />

        <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-6 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                    <span className="inline-flex items-center gap-1 text-fg-faint">
                      <BookOpen className="h-3 w-3" aria-hidden /> Guide
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${LEVEL_TONE[g.level] ?? "bg-bg-sunken text-fg-muted"}`}
                    >
                      {g.level}
                    </span>
                    <span className="inline-flex items-center gap-1 text-fg-faint">
                      <Timer className="h-3 w-3" aria-hidden /> {g.timeMinutes}m to ship
                    </span>
                    <span className="inline-flex items-center gap-1 text-fg-faint">
                      <Clock className="h-3 w-3" aria-hidden /> {g.readingMinutes}m read
                    </span>
                  </div>
                  <h2 className="font-display text-xl leading-tight">{g.title}</h2>
                  <p className="text-sm leading-relaxed text-fg-muted">{g.description}</p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1 text-xs text-fg-faint transition-colors group-hover:text-accent">
                  Start the guide
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageShell>
    </PublicLayout>
  );
}
