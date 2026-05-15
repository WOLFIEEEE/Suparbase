import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SentryDashboard } from "@/components/sentry/SentryDashboard";
import { TermsExplainer, type Term } from "@/components/workspace/TermsExplainer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const SENTRY_TERMS: Term[] = [
  {
    word: "Finding",
    body: (
      <>
        Something Sentry noticed while probing your project. A table the anon
        key can read, an RLS policy that&apos;s missing or too permissive, or
        a PII-shaped column suddenly anon-readable.
      </>
    ),
    hint: "Each finding has a severity (critical / warn / info) and a status (open / acknowledged / quarantined / resolved).",
  },
  {
    word: "Severity",
    body: (
      <>
        How urgent it is.
        <strong className="text-danger"> Critical</strong> = data is leaking
        right now. <strong className="text-warn">Warn</strong> = a misconfig
        that could leak under the wrong conditions.
        <strong className="text-fg-muted"> Info</strong> = context, not a bug.
      </>
    ),
  },
  {
    word: "Quarantine",
    body: (
      <>
        Apply a temporary RLS policy that blocks <em>anon</em> and{" "}
        <em>authenticated</em> access to the affected table. Reversible: the
        Lift button drops the policy when you&apos;ve fixed the root cause.
      </>
    ),
    hint: "Stops the bleeding immediately. Needs the connection's Direct Postgres URL.",
  },
  {
    word: "Acknowledge",
    body: (
      <>
        Archive the finding without changing your database. Useful when the
        finding is expected (e.g. a public lookup table) or when you&apos;ll
        fix it later and don&apos;t need it cluttering the open list.
      </>
    ),
  },
  {
    word: "Resolve",
    body: (
      <>
        Mark the finding as fixed. Doesn&apos;t touch your database, just
        moves the finding to the archived section. Run another scan to confirm
        Sentry no longer surfaces the issue.
      </>
    ),
  },
  {
    word: "Scan",
    body: (
      <>
        One pass of the probe loop: an anon REST <code>GET</code> for every
        table in your <code>public</code> schema plus a <code>pg_policies</code>{" "}
        sweep. Scans are read-only and rate-limited.
      </>
    ),
  },
];

export default async function SentryPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const connection = toSummary(row);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Sentry" },
        ]}
        title="Sentry"
        subtitle={
          <span className="text-xs text-fg-muted">
            Continuous security watchdog. Probes your project with the anon
            REST key, reads <code className="font-mono text-[11px]">pg_policies</code>,
            and flags drift before it ends up on Hacker News.
          </span>
        }
      />
      <TermsExplainer
        storageKey="sentry"
        title="What do these mean?"
        subtitle="Quarantine, Acknowledge, Resolve, and the other Sentry terms"
        terms={SENTRY_TERMS}
      />
      <SentryDashboard connectionId={connection.id} />
    </div>
  );
}
