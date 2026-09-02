import Link from "next/link";
import { ArrowRight, Bot, Brain, Database, History, Sparkles, Zap } from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "ai-startups",
  title: "Suparbase for AI Startups",
  description:
    "Teams shipping RAG and agent products use Suparbase to operate the underlying database. pgvector-aware tools, schema-introspecting AI chat, audit trails for AI-written changes.",
  audience: "AI / RAG / agent startups",
  bullets: [
    "Inspect your RAG embedding tables alongside the business data",
    "Audit every write your agent makes",
    "Built-in RLS debugger for multi-tenant AI products",
    "AI chat that knows your schema, not just public Postgres",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · AI startups"
          title={
            <>
              The admin tool for the
              <br className="hidden sm:inline" /> AI products you&apos;re shipping.
            </>
          }
          subtitle="If your product touches embeddings, agents, or LLM-driven writes, you need an admin that understands all three. Suparbase was built by people shipping AI products; we put the right tools in front of you."
          actions={
            <>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/blog/pgvector-rag-production"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                Read the pgvector guide
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What we built for AI teams"
            title="Tools that know what an AI product actually looks like"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={Database}
              title="Schema introspection across embedding tables"
              body="Your chunks table sits next to your users table. The admin treats both as first-class. No second tool, no separate dashboard."
            />
            <Need
              icon={Brain}
              title="Per-row history for agent-written changes"
              body="Every UPDATE by your agent lands in the audit log with before/after snapshots. When a customer says 'why did this change?', you have an answer."
            />
            <Need
              icon={Sparkles}
              title="Confirm-then-execute for AI write proposals"
              body="The chat assistant drafts; the human clicks Apply. The pattern we ship is the pattern your own AI features should adopt."
            />
            <Need
              icon={Bot}
              title="Multi-tenant RLS debugger"
              body="For B2B AI products, RLS is your isolation. Simulate a customer's request, see what the agent would have seen, prove the isolation works."
            />
            <Need
              icon={Zap}
              title="SQL playground for ad-hoc analysis"
              body="Read-only by default. Run a quick query across your embedding metadata without firing up a notebook."
            />
            <Need
              icon={History}
              title="Audit log keyed to model + token usage"
              body="See which writes came from which agent, which model, what they cost. Optional, but the AI accounting is part of the product."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-6 py-14 text-center md:py-20">
          <p className="text-sm text-fg-muted md:text-base">
            We use Suparbase to operate our own AI features. Every diff card
            you confirm in our chat assistant is the exact pattern we hand
            to AI startups as the right shape for their own products.
          </p>
        </div>
      </section>

      <CTABand
        title="The admin tool for the AI-native era."
        body="Use the Free plan for solo projects, or try the Hosted team plan for seven days."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See features" }}
      />
    </>
  );
}

function Need({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-lg border hairline bg-bg-raised p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-accent/40 bg-accent/10">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
        </span>
        <h3 className="font-display text-base leading-tight">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </li>
  );
}
