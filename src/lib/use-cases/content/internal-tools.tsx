import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  History,
  Pencil,
  Sparkles,
  SquareCode,
  UsersRound,
} from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "internal-tools",
  title: "Internal tools on Supabase, without writing them",
  description:
    "Operations, support, success, and product teams use Suparbase as their internal admin without commissioning a custom build. Per-table archetype views, audit log, AI-assisted ops.",
  audience: "Ops, support, success, product teams",
  bullets: [
    "No custom React grid; no Retool subscription",
    "Per-table views that already look like the thing your team wanted",
    "AI chat for the questions you'd otherwise ask an engineer",
    "Audit log so you know who changed what",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · Internal tools"
          title={
            <>
              Internal admin that
              <br className="hidden sm:inline" /> didn&apos;t need to be built.
            </>
          }
          subtitle="The internal tool everyone keeps deferring. The Retool licence you don't want to renew. The custom React grid your engineering team won't prioritise. This is what we replace."
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
                href="/features"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See features
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Why this beats writing your own"
            title="Four things teams stop doing on day one"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={UsersRound}
              title="Stop maintaining an internal React grid"
              body="The 'simple table view' your engineering team built in three days now eats one engineer-day a month. Filters, exports, pagination, FK lookups: all standard features here, none of them yours to maintain."
            />
            <Need
              icon={Pencil}
              title="Stop opening psql to fix one field"
              body="Click the row, click the value, type the new value, Enter. Done. Recorded in the audit log. No 'who edited what last Wednesday' mysteries."
            />
            <Need
              icon={Sparkles}
              title="Stop pinging engineering for one-off queries"
              body="The team asks 'how many active trial users have logged in this week?' The AI chat answers in 20 seconds; engineering doesn't get pulled out of flow."
            />
            <Need
              icon={History}
              title="Stop guessing at change history"
              body="Every row's detail page has a history panel. Who changed what, when, with column-level diffs. Useful for support, for compliance, for the post-mortem nobody wants to do."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What each team uses"
            title="Built around the seven archetypes you already have"
            subtitle="Suparbase classifies your tables (Users, Content, Logs, Commerce, Tasks, Messages, plus a Generic fallback) and renders purpose-built views for each."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TeamUse
              role="Support"
              what="Cmd-K an email to find the user. One click into the detail page. Generate a password recovery link, copy, paste into the reply."
            />
            <TeamUse
              role="Ops"
              what="Bulk-update orders. Filter on status='pending' + older than X days, multi-select all, bulk-update status to 'cancelled'. Audit log captures it as one operation."
            />
            <TeamUse
              role="Customer success"
              what="The user detail page surfaces last_sign_in_at, providers, plan. Internal CRM fields live in user_metadata and are inline-editable."
            />
            <TeamUse
              role="Product"
              what="Use the AI chat to ask the questions you'd otherwise put on the data team's queue. 'How many tenants signed up this month and haven't created a project yet?'"
            />
          </ul>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Done responsibly"
            title="Internal tools without the foot-guns"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Safe
              icon={ClipboardCheck}
              title="Audit every write"
              body="Same audit log you'd build by hand. Includes who, when, table, primary key, verb, and before/after snapshots."
            />
            <Safe
              icon={SquareCode}
              title="Read-only by default for SQL"
              body="The SQL playground is read-only unless someone explicitly flips write mode behind a confirm dialog. Write-mode queries are audit-logged."
            />
            <Safe
              icon={Sparkles}
              title="The AI never writes directly"
              body="Every AI-proposed write surfaces as a diff card with an Apply button. The server re-validates before executing. No autonomous changes."
            />
          </ul>
        </div>
      </section>

      <CTABand
        title="Skip the build."
        body="Five minutes to your first connection. The internal admin tool your team's been waiting on can ship today."
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

function TeamUse({ role, what }: { role: string; what: string }) {
  return (
    <li className="surface rounded-lg p-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{role}</p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{what}</p>
    </li>
  );
}

function Safe({
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
