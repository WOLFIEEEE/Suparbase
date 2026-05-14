import Link from "next/link";
import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "when-ai-shouldnt-touch-your-database",
  title: "When AI Agents Shouldn't Touch Your Database",
  description:
    "Vibe coding is great. There's a short list of operations where the human still needs to be in the loop. Here's the list, why each one, and the controls to enforce it.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 10,
  tags: ["ai", "vibe-coding", "safety", "databases"],
  related: ["ai-assisted-database-admin", "vibe-coding-database-patterns", "ai-code-review-for-database-prs"],
  toc: [
    { id: "the-list", label: "The five operations" },
    { id: "destructive", label: "Destructive operations" },
    { id: "compliance", label: "Compliance-tagged data" },
    { id: "rls-policies", label: "RLS policies in production" },
    { id: "service-role", label: "Service-role writes at scale" },
    { id: "controls", label: "How to enforce these" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        We&apos;re bullish on AI in the database loop. We&apos;ve built it.
        We also have a list of operations where the agent stays in the
        seat-not-the-pilot. The list is short, the reasons are concrete, and
        the controls are simple enough to ship in a week.
      </p>

      <ArticleH2 id="the-list">The five operations</ArticleH2>
      <ol>
        <li>Destructive operations: <code>DROP</code>, <code>TRUNCATE</code>, mass <code>DELETE</code>.</li>
        <li>Operations on compliance-tagged data (PII, PHI, billing).</li>
        <li>RLS policy changes in production.</li>
        <li>Service-role-key operations that affect many rows.</li>
        <li>Anything that can&apos;t be rolled back without backups.</li>
      </ol>

      <ArticleH2 id="destructive">Destructive operations</ArticleH2>
      <p>
        AI agents in 2026 still occasionally produce confident, wrong, and
        irreversible SQL. The cost of a wrong <code>DROP TABLE</code> on a
        production table is the cost of restoring from your most recent
        backup, which is always more than the cost of one human glance.
      </p>
      <p>The rule: any DDL that drops or truncates a table or schema requires a human approval step, not just a code review.</p>

      <ArticleH2 id="compliance">Compliance-tagged data</ArticleH2>
      <p>
        Tables that carry PII, PHI, payment data, or anything regulated have
        a paper trail requirement. &quot;An AI agent wrote this query&quot;
        isn&apos;t an answer regulators love. Tag those tables and require a
        human-confirmed proposal for writes against them.
      </p>
      <Callout variant="tip" title="The propose-then-execute pattern">
        Tools like <Link href="/features">our AI chat</Link> already gate
        every write behind a human click. The agent drafts; the human
        confirms; the server re-validates. For compliance-tagged tables,
        require this pattern even for read-only summaries that leave the
        building.
      </Callout>

      <ArticleH2 id="rls-policies">RLS policies in production</ArticleH2>
      <p>
        An AI-written RLS policy can look correct and be wrong. The failure
        mode is silent &mdash; a user sees a row they shouldn&apos;t,
        forever, until someone notices. Test policy changes with a real
        simulator (see our <Link href="/blog/row-level-security-postgres-2026">RLS guide</Link>
        ); have a human review the test output.
      </p>
      <p>
        Specifically: don&apos;t let the agent write or modify a policy in
        the same PR as a feature change. Policies get their own PR, their
        own review, and their own deployment.
      </p>

      <ArticleH2 id="service-role">Service-role writes at scale</ArticleH2>
      <p>
        Service-role keys bypass RLS. An agent given a service-role key can
        affect every row in every tenant. The corruption pattern: agent
        misreads the prompt, fires an UPDATE without the right WHERE,
        you&apos;re restoring from backup.
      </p>
      <p>The rule: service-role operations are gated by a named function in
        your codebase, with the function&apos;s code reviewed by a human,
        with an audit-log entry per call.</p>

      <ArticleH2 id="controls">How to enforce these</ArticleH2>
      <ol>
        <li>
          <strong>Don&apos;t give the agent service-role keys in dev.</strong>{" "}
          Default to anon/authenticated. Service-role is opt-in per
          operation with a comment.
        </li>
        <li>
          <strong>CI check on DDL.</strong> Any PR with <code>DROP</code> or{" "}
          <code>TRUNCATE</code> in a migration file requires two human
          approvals.
        </li>
        <li>
          <strong>Tag your tables.</strong> A `compliance` column comment or
          a table in <code>public.compliance_tags</code>. Your AI review
          script reads it; PRs that touch tagged tables get a stricter
          checklist.
        </li>
        <li>
          <strong>Propose-then-execute for AI writes.</strong> The chat
          agent doesn&apos;t write; it drafts a proposal. The human clicks
          Apply. The server re-validates. Every step audit-logged.
        </li>
        <li>
          <strong>PR templates with the &quot;agent involvement&quot;
          checkbox.</strong> If the PR was written primarily by an AI, the
          template asks specific questions. Reviewers see it.
        </li>
      </ol>

      <Callout variant="sparkle" title="The pattern, condensed">
        Reads: anything. Writes that affect few rows: with confirmation.
        Writes that affect many rows or sensitive rows: gated function +
        audit. DDL that drops things: human approval, full stop.
      </Callout>

      <p>
        The point isn&apos;t to slow down vibe-coding. It&apos;s to make
        sure the small set of operations that can&apos;t be undone gets
        the small amount of friction it needs to stay safe. Everything else
        the agent can do at full speed.
      </p>
    </>
  );
}
