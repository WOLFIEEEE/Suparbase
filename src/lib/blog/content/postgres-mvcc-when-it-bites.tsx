import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-mvcc-when-it-bites",
  title: "MVCC in Postgres: When It Bites You",
  description:
    "Postgres uses MVCC for concurrency. Most of the time you don't think about it. Then you do. Here are the four ways MVCC bites in production, and how to handle each.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["postgres", "mvcc", "performance"],
  related: ["postgres-explain-analyze-2026", "postgres-observability-stack-2026", "postgres-partitioning-at-scale"],
  toc: [
    { id: "what-mvcc-is", label: "What MVCC is, briefly" },
    { id: "the-four-bites", label: "Four ways MVCC bites" },
    { id: "bloat", label: "Bloat from long transactions" },
    { id: "xid-wraparound", label: "Transaction ID wraparound" },
    { id: "phantom-reads", label: "Repeatable read surprises" },
    { id: "autovacuum", label: "When autovacuum can't keep up" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Multi-Version Concurrency Control is what makes Postgres feel fast
        even under heavy concurrent writes. Every transaction sees a
        consistent snapshot; readers don&apos;t block writers; writers
        don&apos;t block readers. It works so well most teams never think
        about it.
      </p>
      <p>
        Then they hit a 200 GB table that they swore was 20 GB. Or a
        replication lag that grew during a long-running report. Or a query
        that worked yesterday and times out today. That&apos;s MVCC biting.
      </p>

      <ArticleH2 id="what-mvcc-is">What MVCC is, briefly</ArticleH2>
      <p>
        Every row in Postgres is actually a chain of row versions. An
        UPDATE doesn&apos;t change the row in place; it writes a new
        version and marks the old one as &quot;invisible after transaction
        X&quot;. A DELETE marks the row as invisible; the bytes stay.
      </p>
      <p>
        Older versions get cleaned up by <code>VACUUM</code> (manual or
        autovacuum) once no running transaction can possibly see them.
      </p>

      <ArticleH2 id="the-four-bites">Four ways MVCC bites</ArticleH2>
      <ol>
        <li>Bloat from long-running transactions.</li>
        <li>Transaction ID wraparound on busy databases.</li>
        <li>Repeatable-read isolation hiding new commits from your read.</li>
        <li>Autovacuum not keeping up with churn on big tables.</li>
      </ol>

      <ArticleH2 id="bloat">Bloat from long transactions</ArticleH2>
      <p>
        The most common one. A long-running transaction (a 2-hour analytics
        query, a forgotten <code>BEGIN</code> in a debugging session, a
        sleeping connection that holds a snapshot) prevents VACUUM from
        cleaning up <em>any</em> row versions newer than the moment that
        transaction started.
      </p>
      <p>
        Meanwhile your app keeps writing. Every UPDATE creates a new row
        version. Dead row versions pile up on the heap; the table grows
        even though row count is stable.
      </p>
      <CodeBlock language="sql" filename="find-long-tx.sql">{`-- Find transactions that have been open for more than 5 minutes
SELECT pid, usename, state, query_start, query
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'active')
  AND now() - query_start > interval '5 minutes'
ORDER BY query_start;`}</CodeBlock>
      <Callout variant="watch-out" title="The 'idle in transaction' killer">
        Set <code>idle_in_transaction_session_timeout</code> on your
        application&apos;s role. Even 10 minutes is plenty. The day someone
        steps away with a transaction open, the database closes it instead
        of melting.
      </Callout>

      <ArticleH2 id="xid-wraparound">Transaction ID wraparound</ArticleH2>
      <p>
        Postgres uses a 32-bit transaction ID counter that wraps every ~4
        billion transactions. Before it wraps, autovacuum must &quot;freeze&quot;
        rows to mark them visible to all future transactions. If autovacuum
        can&apos;t keep up, Postgres eventually shuts down to prevent data
        corruption.
      </p>
      <p>
        On databases that write very heavily, this becomes a real
        operational concern past ~1 billion transactions per month. Monitor:
      </p>
      <CodeBlock language="sql">{`SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;`}</CodeBlock>
      <p>
        If <code>xid_age</code> approaches 200 million, your autovacuum
        config is too conservative for your workload.
      </p>

      <ArticleH2 id="phantom-reads">Repeatable-read surprises</ArticleH2>
      <p>
        Most Postgres apps use the default isolation level (read committed).
        Some use repeatable read for stronger consistency. The latter has a
        surprise: a transaction in repeatable read sees the data as it was
        at the transaction&apos;s start. New commits by other transactions
        are invisible to it.
      </p>
      <p>
        This is fine for analytics, terrible for &quot;read latest user
        balance&quot; logic. Watch for: a transaction that reads, computes,
        writes, and you find the write was based on stale data. That&apos;s
        repeatable read being too strong for your use case.
      </p>

      <ArticleH2 id="autovacuum">When autovacuum can&apos;t keep up</ArticleH2>
      <p>
        Default autovacuum settings are tuned for moderate workloads. High-
        churn tables (sessions, queue tables, append-then-delete patterns)
        often need per-table tuning:
      </p>
      <CodeBlock language="sql">{`ALTER TABLE sessions SET (
  autovacuum_vacuum_scale_factor = 0.05,  -- vacuum when 5% dead (default 20%)
  autovacuum_vacuum_cost_limit   = 1000,  -- run faster
  autovacuum_analyze_scale_factor = 0.02
);`}</CodeBlock>
      <p>
        Watch <code>pg_stat_user_tables.n_dead_tup</code> over time. If it
        keeps climbing, autovacuum isn&apos;t winning the race.
      </p>

      <Callout variant="sparkle" title="The MVCC operations checklist">
        Statement timeout: yes. Idle-in-transaction timeout: yes. Monitor
        long-running transactions: weekly review. Per-table autovacuum
        tuning for high-churn tables: when you see growing dead-tup counts.
      </Callout>

      <p>
        MVCC is a great trade-off. The cost is that you have to operate
        VACUUM thoughtfully on high-volume databases. Treat it as a
        first-class operational concern and it rarely bites; ignore it and
        it bites at the worst possible time.
      </p>
    </>
  );
}
