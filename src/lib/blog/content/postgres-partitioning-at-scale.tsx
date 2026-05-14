import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-partitioning-at-scale",
  title: "Postgres Partitioning at Scale",
  description:
    "Declarative partitioning landed years ago; in 2026 it's the boring-and-correct answer for tables past 100M rows. The patterns that work, the gotchas, and when to skip it.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["postgres", "partitioning", "scale"],
  related: ["postgres-mvcc-when-it-bites", "postgres-explain-analyze-2026", "postgres-indexes-explained-2026"],
  toc: [
    { id: "when-to-partition", label: "When you actually need it" },
    { id: "by-range", label: "Range partitioning (the common case)" },
    { id: "by-list", label: "List partitioning" },
    { id: "by-hash", label: "Hash partitioning" },
    { id: "pg-partman", label: "pg_partman" },
    { id: "gotchas", label: "Three gotchas" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Declarative partitioning shipped in Postgres 10 (2017). By 2024 the
        rough edges were smoothed; in 2026 it&apos;s the standard answer
        for tables that have grown past 100M rows. The most common
        application: time-series data that ages out, where dropping a
        partition is cheaper than running a DELETE.
      </p>

      <ArticleH2 id="when-to-partition">When you actually need it</ArticleH2>
      <p>Three signals that a table wants to be partitioned:</p>
      <ul>
        <li>
          <strong>The table is past 100M rows</strong> and queries that touch
          a small slice scan more pages than they should because the heap is
          too big.
        </li>
        <li>
          <strong>You have a retention policy</strong>: rows older than X
          months get deleted or archived. <code>DELETE</code> on hot tables
          is expensive; dropping a partition is instant.
        </li>
        <li>
          <strong>Maintenance operations are blocking</strong>: a VACUUM or
          REINDEX on the whole table is too slow. Partitions let you operate
          per-segment.
        </li>
      </ul>
      <p>
        If none of these apply, you almost certainly don&apos;t need
        partitioning. Add indexes first.
      </p>

      <ArticleH2 id="by-range">Range partitioning (the common case)</ArticleH2>
      <p>Best for time-series: events, audit logs, metrics.</p>
      <CodeBlock language="sql" filename="range-partition.sql">{`-- Parent table is partitioned
CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL,
  tenant_id   uuid NOT NULL,
  payload     jsonb NOT NULL
) PARTITION BY RANGE (occurred_at);

-- Create a partition per month
CREATE TABLE events_2026_05 PARTITION OF events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE events_2026_06 PARTITION OF events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Indexes go on the parent; Postgres creates them per partition
CREATE INDEX events_tenant_time_idx ON events (tenant_id, occurred_at DESC);`}</CodeBlock>
      <p>Queries that filter on <code>occurred_at</code> get partition pruning automatically: only the relevant partitions are scanned.</p>

      <ArticleH2 id="by-list">List partitioning</ArticleH2>
      <p>
        Use when you partition by a categorical column with a small,
        bounded set of values. Multi-region apps partitioning by
        <code>region</code> is the canonical case.
      </p>
      <CodeBlock language="sql">{`CREATE TABLE invoices (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region    text NOT NULL,
  ...
) PARTITION BY LIST (region);

CREATE TABLE invoices_us PARTITION OF invoices FOR VALUES IN ('us', 'us-east', 'us-west');
CREATE TABLE invoices_eu PARTITION OF invoices FOR VALUES IN ('eu', 'eu-west', 'eu-central');`}</CodeBlock>

      <ArticleH2 id="by-hash">Hash partitioning</ArticleH2>
      <p>
        Splits data evenly across N partitions by hashing a column. Useful
        when you want to spread write load across many physical tables but
        don&apos;t have a natural range or list to partition by.
      </p>
      <CodeBlock language="sql">{`CREATE TABLE user_events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL,
  ...
) PARTITION BY HASH (user_id);

CREATE TABLE user_events_p0 PARTITION OF user_events FOR VALUES WITH (modulus 4, remainder 0);
CREATE TABLE user_events_p1 PARTITION OF user_events FOR VALUES WITH (modulus 4, remainder 1);
CREATE TABLE user_events_p2 PARTITION OF user_events FOR VALUES WITH (modulus 4, remainder 2);
CREATE TABLE user_events_p3 PARTITION OF user_events FOR VALUES WITH (modulus 4, remainder 3);`}</CodeBlock>
      <Callout variant="watch-out" title="Hash partitioning trade-offs">
        Hash partitioning gives even distribution but breaks the
        &quot;drop old data fast&quot; advantage of range partitioning.
        Don&apos;t pick hash unless even write distribution is your
        actual problem.
      </Callout>

      <ArticleH2 id="pg-partman">pg_partman for time-series</ArticleH2>
      <p>
        Manually creating monthly partitions ahead of time is tedious and
        error-prone. <code>pg_partman</code> automates the creation,
        retention, and maintenance.
      </p>
      <CodeBlock language="sql" filename="partman-setup.sql">{`CREATE EXTENSION pg_partman;

SELECT partman.create_parent(
  p_parent_table => 'public.events',
  p_control      => 'occurred_at',
  p_type         => 'native',
  p_interval     => 'monthly',
  p_premake      => 4              -- keep 4 months of future partitions ready
);

-- Then a cron / pg_cron job runs:
SELECT partman.run_maintenance();
-- Creates future partitions, drops old ones based on retention setting.`}</CodeBlock>
      <p>
        On Supabase, partman is available as an extension; enable it in
        Studio. Add a pg_cron job that runs <code>run_maintenance()</code>{" "}
        daily.
      </p>

      <ArticleH2 id="gotchas">Three gotchas</ArticleH2>

      <h3>1. Primary keys must include the partition key</h3>
      <p>
        Postgres requires this. If your existing table has a primary key
        that doesn&apos;t include the partition column, you&apos;ll need to
        widen it.
      </p>

      <h3>2. Foreign keys to partitioned tables are limited</h3>
      <p>
        Pre-Postgres-15, you couldn&apos;t create a foreign key referencing
        a partitioned table. 15+ fixes this; older versions need
        application-level enforcement.
      </p>

      <h3>3. Migration of an existing table is non-trivial</h3>
      <p>
        You can&apos;t turn an existing table into a partitioned one
        in-place. The migration: create a new partitioned table; copy data;
        rename. Plan for downtime or use the rename-the-old-table /
        cutover trick.
      </p>

      <Callout variant="sparkle" title="The decision">
        Partition tables that are past 100M rows AND have either a natural
        retention policy or a maintenance problem. Use range partitioning
        with pg_partman for time-series; hash partitioning only when you
        have measured write skew. For everything else, indexes and
        sensible vacuuming get you further than you&apos;d think.
      </Callout>
    </>
  );
}
