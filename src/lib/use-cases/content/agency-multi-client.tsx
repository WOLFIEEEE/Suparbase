import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Database,
  FolderTree,
  History,
  KeyRound,
  ShieldCheck,
  Users,
} from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "agency-multi-client",
  title: "One workspace for every client Supabase project",
  description:
    "Agencies and consultants managing many client Supabase projects use Suparbase to consolidate every dashboard into one workspace with per-client audit and isolated credentials.",
  audience: "Agencies, consultants, freelance teams",
  bullets: [
    "All your client Supabase projects in one workspace",
    "Per-project audit log keyed to who did what",
    "Switch context with Cmd-K, no logging into N Supabase dashboards",
    "Hand a client a read-only seat without giving them root",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · Agencies"
          title={
            <>
              One workspace.
              <br className="hidden sm:inline" /> All your clients&apos; Supabase projects.
            </>
          }
          subtitle="If you operate Supabase for clients, you've felt this: ten browser tabs, ten Supabase Studios, ten dashboards with different keys, and no audit trail that says who did what to whom."
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
                href="/pricing"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See pricing
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The agency problem"
            title="Tabs aren't an architecture"
            subtitle="When you operate ten or twenty client Supabase projects, the wins compound, and so do the failure modes."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={FolderTree}
              title="One sidebar, all projects"
              body="Every connection you add becomes another entry in the sidebar. Switch with Cmd-K. The keys for each one are encrypted in our vault; you never paste them again."
            />
            <Need
              icon={KeyRound}
              title="Per-project credential isolation"
              body="Each connection has its own encrypted key. A teammate who shouldn't see Client X never sees that connection. Self-host gives you full RBAC; hosted ships per-org access in Q3."
            />
            <Need
              icon={History}
              title="Audit log per project"
              body="Every write is logged with the human, the connection, the table, and the row. When a client asks 'who changed this on Tuesday?' you have an answer."
            />
            <Need
              icon={ShieldCheck}
              title="RLS that works across all of them"
              body="One direct-Postgres URL per project (encrypted) unlocks our RLS debugger so you can answer 'is this policy doing what we wanted?' on any client without leaving the workspace."
            />
            <Need
              icon={Database}
              title="SQL playground without ten psqls"
              body="Read-only by default. You don't need to fish out the password for the right server; the playground reads it from the same vault."
            />
            <Need
              icon={Users}
              title="Hand a client a seat without giving them keys"
              body="On hosted, invite the client as a read-only viewer on their own project. They see the audit log; they can't change the encrypted key or remove connections."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Operationally"
            title="What an agency week looks like"
          />
          <ol className="space-y-7">
            <Step
              when="Monday"
              title="Onboard a new client project in 3 minutes."
              body="Get the Supabase URL and service_role key from the client. Paste them in /connections. The connection's archetype labels run automatically. You're in business; no Studio bookmarking, no separate password manager note."
            />
            <Step
              when="Wednesday"
              title="Triage a support ticket across two clients."
              body="Client A says emails aren't sending. Client B says checkout broke. Cmd-K, switch to A, look at auth_users, find the unconfirmed accounts, generate a recovery link, paste in your reply. Cmd-K, switch to B, look at the orders table sorted by created_at, find the broken order, open the row, see the audit history. Both fixed before lunch."
            />
            <Step
              when="Friday"
              title="Hand a client a clean weekly digest."
              body="Open the AI chat on the client's connection. 'Summarise the last week's writes by table.' Tool-use loops over count_rows; agent comes back with 'orders +43, users +12, support_tickets -7'. Copy into your weekly status email."
            />
          </ol>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The agency-specific upsides"
            title="What we built because agencies asked"
            subtitle="The product exists in part because four different consulting teams kept emailing us with the same feature requests."
          />
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Win
              title="Audit log retention"
              body="Hosted plan keeps your audit log for 90 days. Self-host: forever. Compliance answers stop being a 'I'll check our notes' email."
            />
            <Win
              title="Read-only client seats"
              body="A client can see their own project's audit log without being able to add a connection or change a key. Useful for SOC2 evidence too."
            />
            <Win
              title="One bill, many projects"
              body="Hosted plan is per-user, not per-connection. Add as many client Supabase projects as you want — your bill scales with your team, not your client list."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-16 md:flex-row md:items-center md:py-20">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/15">
            <Building2 className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-fg-muted md:text-base">
            We&apos;ve had agency users go from &quot;separate Studio for every client&quot; to
            &quot;one workspace, one login&quot; in an afternoon. The migration is
            painless because nothing about your clients&apos; Supabase projects
            changes; you just point our admin tool at each one, and you&apos;re done.
          </p>
        </div>
      </section>

      <CTABand
        title="Consolidate the tabs."
        body="Five minutes to your first client connection. Hosted is per-seat, so unlimited connections cost the same."
        primary={{ href: "/signup", label: "Start free trial" }}
        secondary={{ href: "/pricing", label: "Hosted pricing" }}
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

function Step({ when, title, body }: { when: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-4 md:gap-6">
      <span aria-hidden className="select-none font-mono text-[11px] uppercase tracking-wider text-accent">
        {when}
      </span>
      <div className="border-l hairline pl-5 md:pl-6">
        <h3 className="font-display text-base leading-tight md:text-lg">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

function Win({ title, body }: { title: string; body: string }) {
  return (
    <li className="surface rounded-lg p-5">
      <h4 className="font-display text-base leading-tight">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
    </li>
  );
}
