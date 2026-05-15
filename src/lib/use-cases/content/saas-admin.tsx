import Link from "next/link";
import {
  ArrowRight,
  Database,
  History,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,

} from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "saas-admin",
  title: "Admin dashboard for SaaS founders on Supabase",
  description:
    "A working admin tool for the solo founder running a SaaS on Supabase. Inline edit, AI-assisted operations, audit log, no custom code.",
  audience: "Solo SaaS founders running on Supabase",
  bullets: [
    "Skip writing an internal admin from scratch",
    "Inline-edit rows; AI assistant for the gnarlier queries",
    "Every write logged to an audit trail with row-level diffs",
    "Five minutes to first connection, no DevOps required",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · SaaS founders"
          title={
            <>
              Run your SaaS without
              <br className="hidden sm:inline" /> writing an admin.
            </>
          }
          subtitle="You shipped the product. You don't need to ship a second product just to operate the first one. Suparbase is the admin tool you were going to build, ready to use."
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
            eyebrow="Why founders pick us"
            title="The five things every founder ends up needing"
            subtitle="And the five reasons writing them yourself costs a month you don't have."
          />

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={Database}
              title="A reliable table browser"
              body="Real rows, type-aware filters, FK lookups, CSV export. Not the Supabase Studio compromise; not a hand-built React grid you'll have to maintain."
            />
            <Need
              icon={Pencil}
              title="One-off row edits without opening psql"
              body="Click any cell on the row detail page. Edit. Enter. Done. The kind of operation you do five times a day; the kind your custom admin never quite gets right."
            />
            <Need
              icon={Search}
              title="Find that one user, fast"
              body="Cmd-K, type an email or an order number, the palette searches every public-schema table in parallel and links straight to the row."
            />
            <Need
              icon={Sparkles}
              title="An AI that can do real work"
              body="Ask 'cancel every order older than 30 days that's still pending'; get a diff card back; click Apply if you want it. The agent can't write directly without your click."
            />
            <Need
              icon={History}
              title="Audit who did what"
              body="Every write, by you, by your assistant, by the API, lands in an audit table with before/after row snapshots and a per-row history timeline."
            />
            <Need
              icon={ShieldCheck}
              title="An RLS escape hatch when policy breaks"
              body="When a customer says 'I can't see my data', the RLS debugger simulates their request as any role with any JWT claims and tells you which policy denied. Inside a rolled-back transaction so nothing persists."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="A day in the life"
            title="How founders actually use this"
          />
          <ol className="space-y-7">
            <Step
              num="08:30"
              title="A customer emails: 'My subscription says expired, but I paid yesterday.'"
              body="Open the workspace. Cmd-K, paste their email. Their user row appears. One click into the detail page. The 'History' panel shows the subscription updated to expired by a webhook this morning. Open the related subscriptions row. Inline-edit status back to active. Add a note in user_metadata explaining why. The customer's response is in your sent folder five minutes later."
            />
            <Step
              num="11:00"
              title="A teammate asks for a report: 'How many trials converted last month?'"
              body="Open Ask AI. 'How many trial users converted to paid in April?' The agent calls list_tables, finds the subscriptions table, looks at the schema, runs count_rows with the right filter, and replies with the number. Costs you 30 seconds and roughly two cents in tokens."
            />
            <Step
              num="14:15"
              title="You're shipping a feature: a new role column on users."
              body="Open the SQL playground. The page reminds you it's in read-only mode, so you flip to write mode with a confirm dialog. ALTER TABLE ADD COLUMN. Sanity-check with SELECT. The write is in the audit log. You drop a Slack message: 'role column shipped'."
            />
            <Step
              num="18:00"
              title="Spot-check the audit log before logging off."
              body="Recent activity shows the day's writes, click any of them to jump to the row, see the diff. Catch one wrong update (your own, an hour ago, fat-fingered). Use the row history to copy the previous value, inline-edit it back. Two minutes."
            />
          </ol>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 py-16 md:grid-cols-3 md:py-20">
          <StatBlock label="Time to first connection" value="~5 min" />
          <StatBlock label="Cost to start" value="$0" sub="Free tier, no card" />
          <StatBlock label="Lines of admin you maintain" value="0" />
        </div>
      </section>

      <CTABand
        title="Stop putting off the admin tool."
        body="Five minutes to your first connection. The five other tools you cobbled together can go away after that."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See all features" }}
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

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-4 md:gap-6">
      <span aria-hidden className="select-none font-mono text-[11px] uppercase tracking-wider text-accent">
        {num}
      </span>
      <div className="border-l hairline pl-5 md:pl-6">
        <h3 className="font-display text-base leading-tight md:text-lg">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface space-y-1 rounded-lg p-6 text-center">
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</p>
      <p className="font-display text-3xl text-fg">{value}</p>
      {sub && <p className="text-[11px] text-fg-faint">{sub}</p>}
    </div>
  );
}

