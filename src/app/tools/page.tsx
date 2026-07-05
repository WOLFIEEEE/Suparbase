import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound, Network, ShieldAlert, ShieldCheck } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { TOOLS } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

export const metadata: Metadata = {
  title: "Free Supabase Tools · Suparbase",
  description:
    "Free, no-login tools for Supabase and Postgres developers: a security scanner, RLS policy generator, schema visualizer, and secret leak scanner.",
  alternates: { canonical: absoluteUrl("/tools") },
};

const ICON = { ShieldAlert, ShieldCheck, Network, KeyRound } as const;

export default function ToolsIndexPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Free tools · no login"
          title="Free tools for Supabase developers"
          subtitle="Instant, no-account utilities for the things Supabase makes you sweat over — security, RLS, schema, and leaked keys. Three run entirely in your browser."
        />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const Icon = ICON[t.icon];
            return (
              <li key={t.slug}>
                <Link
                  href={`/tools/${t.slug}`}
                  className={cn(
                    "group flex h-full flex-col gap-3 rounded-lg border hairline bg-bg-raised p-5 transition-colors",
                    "hover:border-line-strong hover:bg-bg-raised/90",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-accent" aria-hidden />
                    <h2 className="font-display text-lg">{t.short}</h2>
                    {t.clientOnly && (
                      <span className="ml-auto rounded-full border hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint">
                        in-browser
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-fg-muted">{t.tagline}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    Open tool
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PageShell>
      <CTABand
        title="The tools are the teaser. The workspace is the product."
        body="A full admin for any Supabase project — encrypted server-side proxy, AI-assisted writes, agent attribution, and continuous security monitoring."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See features" }}
      />
    </PublicLayout>
  );
}
