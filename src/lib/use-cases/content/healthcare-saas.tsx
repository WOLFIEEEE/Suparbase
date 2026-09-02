import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileText, History, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "healthcare-saas",
  title: "Suparbase for Healthcare SaaS",
  description:
    "Healthcare-adjacent SaaS teams use Suparbase for the audit trail, encryption, and isolation requirements they need to satisfy compliance reviews.",
  audience: "Healthcare-adjacent SaaS teams",
  bullets: [
    "AES-256-GCM credential vault; keys never reach a browser",
    "Per-row audit log with before/after snapshots for every write",
    "RLS-as-authz, with a debugger that proves the isolation works",
    "Dedicated single-tenant deployment available on Team",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · Healthcare"
          title={
            <>
              An admin tool that
              <br className="hidden sm:inline" /> passes the compliance review.
            </>
          }
          subtitle="If you handle PHI or PHI-adjacent data, your admin tool has to satisfy auditors. Suparbase encrypts credentials at rest, proxies every request server-side, and audits every write. The bones of a compliant operations stack."
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
                href="/contact?topic=sales"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                Talk to us
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The compliance basics"
            title="What auditors typically ask about"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={Lock}
              title="Credentials at rest"
              body="AES-256-GCM encryption; the vault key comes from the deployment environment and is never written to a log or returned over the wire. Dedicated deployments keep that boundary on isolated infrastructure."
            />
            <Need
              icon={History}
              title="Audit trails per row"
              body="Every write captures who, when, what (table, primary key, verb), and the before/after snapshot when available. Queryable for compliance reports."
            />
            <Need
              icon={ShieldCheck}
              title="Row-Level Security verification"
              body="Built-in simulator runs SELECT/INSERT/UPDATE/DELETE inside a rolled-back transaction with simulated JWT claims. Proves the isolation works."
            />
            <Need
              icon={ClipboardCheck}
              title="Read-only by default"
              body="SQL playground and AI chat are read-only by default; writes require an explicit toggle or a confirmed proposal. Friction by design."
            />
            <Need
              icon={KeyRound}
              title="Role-based access"
              body="Service-role operations are explicit, named, and audit-logged. Anon and authenticated paths obey RLS."
            />
            <Need
              icon={FileText}
              title="Dedicated deployments"
              body="A Team agreement can include a single-tenant deployment, custom data retention, and procurement documentation tailored to your requirements."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-6 py-14 md:py-20">
          <SectionHeading
            eyebrow="Disclaimers"
            title="What this is and isn't"
            align="center"
          />
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-fg-muted">
            <p>
              Suparbase doesn&apos;t come with a HIPAA certification. The
              certification is a property of how you operate the system, not
              the system itself. The features above are the technical
              foundation auditors look for: encryption, audit trails, role
              isolation, replayable evidence. You bring the operational
              policies (access reviews, BAAs, training) on top.
            </p>
            <p>
              For teams with a strict compliance posture, the recommended
              shape is a dedicated single-tenant deployment under a Team
              agreement, a narrowly controlled service-role Supabase key,
              nightly database backups, and a recurring RLS review against
              your tenant model.
            </p>
          </div>
        </div>
      </section>

      <CTABand
        title="Talk to us about your compliance posture."
        body="We'll help you map the features to your auditor's checklist."
        primary={{ href: "/contact?topic=sales", label: "Talk to us" }}
        secondary={{ href: "/docs#security", label: "Read the security model" }}
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
