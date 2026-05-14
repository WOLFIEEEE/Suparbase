import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "capping-ai-database-costs",
  title: "Capping the Cost of AI-Generated Database Code",
  description:
    "AI-paired teams can rack up surprising database bills: bad queries, runaway loops, expensive review pipelines. Here's how to put guardrails in place without slowing the team down.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 10,
  tags: ["ai", "cost-control", "postgres", "operations"],
  related: ["postgres-observability-stack-2026", "vibe-coding-database-patterns", "ai-code-review-for-database-prs"],
  toc: [
    { id: "where-costs-come-from", label: "Where the costs actually come from" },
    { id: "query-cost", label: "The bad-query tax" },
    { id: "review-cost", label: "AI review token bills" },
    { id: "review-loops", label: "Runaway review loops" },
    { id: "guardrails", label: "The five guardrails" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        AI-paired teams in 2026 are surprised by two recurring bills: the
        database bill (because the agent shipped a query that scans 100M
        rows every minute) and the AI bill (because review pipelines ran
        on every line change). Both are preventable with simple guardrails.
      </p>

      <ArticleH2 id="where-costs-come-from">Where the costs actually come from</ArticleH2>
      <ul>
        <li>
          <strong>Sequential scans the agent didn&apos;t mean to write.</strong>{" "}
          A missed index turns a 5ms query into a 5s query, which turns
          into a 50% CPU spike under load.
        </li>
        <li>
          <strong>N+1 patterns inside server actions.</strong> The agent
          generates a route that loads 50 related records in a loop. Each
          one is a separate query.
        </li>
        <li>
          <strong>AI review on every PR, including formatting-only PRs.</strong>{" "}
          5,000-token reviews on a Friday afternoon at the end of the
          month adds up.
        </li>
        <li>
          <strong>Runaway agent loops.</strong> An agent that gets confused
          and keeps retrying produces a huge token bill before someone
          notices.
        </li>
      </ul>

      <ArticleH2 id="query-cost">The bad-query tax</ArticleH2>
      <p>
        The single biggest database cost spike from AI work is missing
        indexes on new columns. Mitigation: run pg_stat_statements regularly,
        sort by total time, look for queries that show up surprisingly.
      </p>
      <p>
        Add a CI step that runs <code>EXPLAIN</code> on the queries
        introduced in a PR (via your test suite, or via a static analysis
        tool that finds <code>db.select</code> calls). Flag anything that
        comes back with Seq Scan on a large table.
      </p>
      <Callout variant="tip" title="Statement timeout">
        Set a statement_timeout on your application&apos;s database role.
        A 5-second cap is reasonable for OLTP. The agent&apos;s bad query
        fails loudly instead of silently saturating the database.
      </Callout>

      <ArticleH2 id="review-cost">AI review token bills</ArticleH2>
      <p>
        AI code review is excellent value, but the cost adds up when:
      </p>
      <ul>
        <li>Every PR runs review (including dependency bumps).</li>
        <li>The review prompt is huge (entire codebase as context).</li>
        <li>The model is large (Claude Opus / GPT-4 Turbo) when a small model would do.</li>
      </ul>
      <p>Practical caps:</p>
      <ul>
        <li>Run review only on PRs that touch <code>src/db/</code>, <code>drizzle/</code>, or <code>src/lib/auth/</code>.</li>
        <li>Hard token cap per PR (~50k input + 10k output is plenty for one PR).</li>
        <li>Use a smaller model (Claude Sonnet, GPT-4o-mini) for first-pass review; escalate to a big model only if the small one flags something.</li>
      </ul>

      <ArticleH2 id="review-loops">Runaway review loops</ArticleH2>
      <p>
        A specific failure mode: an agent that doesn&apos;t know what to do
        and keeps retrying. We&apos;ve seen this produce $40 token bills on
        a single PR. Mitigations:
      </p>
      <ul>
        <li>Cap the number of tool calls per agent run. 6-8 is plenty for database operations.</li>
        <li>Cap the wall-clock time per run. 60 seconds is a reasonable upper bound.</li>
        <li>Alert on token-bill anomalies. If a single run exceeds your typical p99, page someone.</li>
      </ul>

      <ArticleH2 id="guardrails">The five guardrails</ArticleH2>
      <ol>
        <li>
          <strong>Statement timeout on the application role.</strong> 5 seconds.
        </li>
        <li>
          <strong>pg_stat_statements review on a schedule.</strong> Weekly,
          someone looks at the top 20 queries by total time and asks
          &quot;is this what we expected?&quot;
        </li>
        <li>
          <strong>AI review gated by path filter.</strong> Only run on PRs
          that touch the database / auth / migrations directories.
        </li>
        <li>
          <strong>Token cap per AI run.</strong> Both for the review
          pipeline and any in-app agent (chat assistant, copilot).
        </li>
        <li>
          <strong>Audit log + Sentry tracing on agent-initiated writes.</strong>{" "}
          So when something looks weird, you can prove it was the agent
          and roll it back.
        </li>
      </ol>

      <p>
        None of these slow the team down meaningfully. They cap the worst
        cases. The day the agent goes feral and someone notices in the
        morning, the bill is hundreds, not thousands.
      </p>
    </>
  );
}
