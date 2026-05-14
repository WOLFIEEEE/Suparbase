import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { listUseCases } from "@/lib/use-cases/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

const title = "Use cases · Suparbase";
const description =
  "Suparbase across three real shapes of work: SaaS founders running their own product, agencies managing many client Supabase projects, and ops teams who want internal tools without building them.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/use-cases") },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/use-cases"),
    siteName: SITE.name,
    type: "website",
  },
};

export default async function UseCasesHubPage() {
  const useCases = listUseCases();
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Use cases", href: "/use-cases" },
        ])}
      />
      <PageShell>
        <PageHeader
          eyebrow="Use cases"
          title={
            <>
              Three shapes of work.
              <br className="hidden sm:inline" /> One tool that fits all of them.
            </>
          }
          subtitle="We don't sell to one persona because Suparbase isn't really a niche tool. These are the three shapes of work that keep ending up in customer interviews."
        />

        <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {useCases.map((u) => (
            <li key={u.slug}>
              <Link
                href={`/use-cases/${u.slug}`}
                className="group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-6 transition-colors hover:border-line-strong hover:bg-bg-raised/90"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                    {u.audience}
                  </p>
                  <h2 className="mt-2 font-display text-xl leading-tight">{u.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {u.description}
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {u.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-xs text-fg-muted">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-5 inline-flex items-center gap-1 text-xs text-fg-faint group-hover:text-accent">
                  See use case
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageShell>

      <CTABand
        title="Not on this list?"
        body="If your shape of work isn't above, we'd still like to hear about it. The product is general enough that most teams find a fit."
        primary={{ href: "/signup", label: "Try it free" }}
        secondary={{ href: "/features", label: "See features" }}
      />
    </PublicLayout>
  );
}
