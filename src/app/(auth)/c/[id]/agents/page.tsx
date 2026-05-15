import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { AgentSessions } from "@/components/sentry/AgentSessions";
import { TermsExplainer, type Term } from "@/components/workspace/TermsExplainer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const AGENT_TERMS: Term[] = [
  {
    word: "Session",
    body: (
      <>
        A group of database writes that came from the same AI tool within a
        rolling 5-minute window. One Cursor refactor that does 47 mutations
        across 3 tables lands in a single session row, not 47.
      </>
    ),
  },
  {
    word: "Mutation",
    body: (
      <>
        A single INSERT, UPDATE, or DELETE that went through Suparbase&apos;s
        proxy. Every mutation is captured in the audit log with a before/after
        snapshot, which is what makes undo possible.
      </>
    ),
  },
  {
    word: "Agent kind",
    body: (
      <>
        Which AI tool made the write, identified from the request&apos;s
        User-Agent header: Cursor, Claude Code, Replit Agent, Lovable, v0,
        Vercel AI SDK, or your own MCP server. Unrecognised AI-shaped UAs land
        in <code>ai_unknown</code>; humans land in <code>browser</code> or{" "}
        <code>cli</code>.
      </>
    ),
  },
  {
    word: "Undo session",
    body: (
      <>
        Reverse every mutation in this session in one Postgres transaction.
        INSERTs become DELETEs, DELETEs become INSERTs from the saved
        snapshot, UPDATEs are rolled back to the previous column values.
        Either all reversals succeed or none do.
      </>
    ),
    hint: "Bypasses RLS via the Direct Postgres URL, this is an admin operation you explicitly authorised.",
  },
  {
    word: "Active",
    body: (
      <>
        The session is still receiving writes (last write within the last
        5 minutes). Click into it to see the full mutation list, then undo
        whenever you&apos;re ready.
      </>
    ),
  },
  {
    word: "Closed / Undone",
    body: (
      <>
        <strong>Closed</strong> = the 5-minute window expired without an undo,
        so the session is sealed. <strong>Undone</strong> = you ran undo and
        every mutation reversed cleanly. <strong>Undo partial</strong> /{" "}
        <strong>undo failed</strong> mean the transaction partly or wholly
        rolled back, see the session detail for the error.
      </>
    ),
  },
];

export default async function AgentSessionsPage({ params }: Props) {
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
          { label: "Agents" },
        ]}
        title="Agent sessions"
        subtitle={
          <span className="text-xs text-fg-muted">
            Every AI write to this database, grouped into sessions you can
            review and one-click undo. Designed for when Cursor / Claude
            Code / Replit Agent / Lovable / v0 does something you
            didn&apos;t intend.
          </span>
        }
      />
      <TermsExplainer
        storageKey="agents"
        title="What do these mean?"
        subtitle="Session, mutation, undo, status badges"
        terms={AGENT_TERMS}
      />
      <AgentSessions connectionId={connection.id} />
    </div>
  );
}
