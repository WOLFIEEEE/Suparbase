import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-observability-stack-2026",
  title: "The Modern Postgres Observability Stack in 2026",
  description:
    "The metrics that actually matter, the tools that work in 2026, and the alerts to set up before your database becomes someone else's problem.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["postgres", "observability", "operations"],
  related: ["postgres-mvcc-when-it-bites", "postgres-explain-analyze-2026", "database-backups-2026"],
  toc: [
    { id: "what-you-actually-need", label: "What you actually need" },
    { id: "core-extensions", label: "Core extensions" },
    { id: "metrics-to-watch", label: "The metrics to watch" },
    { id: "tooling", label: "Tooling that ships" },
    { id: "alerts", label: "Alerts to set up" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Postgres observability is a solved problem in 2026, but most teams
        ship with the default RDS / Supabase dashboards and call it done.
        That&apos;s fine until something goes wrong; then you need the
        layer underneath. Here&apos;s what that layer looks like and the
        minimum viable stack.
      </p>

      <ArticleH2 id="what-you-actually-need">What you actually need</ArticleH2>
      <p>Three categories:</p>
      <ol>
        <li><strong>Query-level</strong>: which queries are slow, why, how often.</li>
        <li><strong>Connection-level</strong>: how many connections, what they&apos;re doing, who&apos;s waiting.</li>
        <li><strong>System-level</strong>: CPU, memory, IO, disk, replication lag.</li>
      </ol>
      <p>
        The provider dashboards give you the third one for free. The first
        two are where you live during incidents.
      </p>

      <ArticleH2 id="core-extensions">Core extensions</ArticleH2>
      <ul>
        <li>
          <strong>pg_stat_statements</strong>: enabled by default on most
          managed Postgres. Records each query&apos;s mean / total time and
          calls. The single most useful Postgres tool ever shipped.
        </li>
        <li>
          <strong>auto_explain</strong>: logs the EXPLAIN plan for any query
          slower than a threshold. Set the threshold to your SLO; alerts
          arrive with the plan attached.
        </li>
        <li>
          <strong>pg_stat_kcache</strong>: per-query OS-level stats (CPU
          time, IO bytes). Optional but pairs well with pg_stat_statements.
        </li>
      </ul>
      <CodeBlock language="sql" filename="enable.sql">{`-- pg_stat_statements: enable in postgresql.conf and reload
-- (on Supabase, it's already on)
shared_preload_libraries = 'pg_stat_statements,auto_explain'

-- Then in the database:
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- auto_explain config
auto_explain.log_min_duration = '200ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on`}</CodeBlock>

      <ArticleH2 id="metrics-to-watch">The metrics to watch</ArticleH2>
      <p>For each category, a short list of the metrics that actually predict trouble:</p>

      <h3>Query-level</h3>
      <ul>
        <li>Top 10 queries by total time from pg_stat_statements. Review weekly.</li>
        <li>Mean execution time over the last hour vs the same hour last week. Anomalies are usually new bad queries.</li>
        <li>Query call count anomalies. A query that suddenly fires 100x more often is usually a missing cache or a polling loop.</li>
      </ul>

      <h3>Connection-level</h3>
      <ul>
        <li>Active connection count vs <code>max_connections</code>. Past 80% is danger.</li>
        <li>Idle-in-transaction connections. Any over a few minutes is a bug.</li>
        <li>Lock waits via <code>pg_locks</code> joined to <code>pg_stat_activity</code>.</li>
      </ul>

      <h3>System-level</h3>
      <ul>
        <li>CPU utilisation. Sustained over 70% means you need more compute or a query fix.</li>
        <li>Disk space free. Postgres degrades poorly when disk fills.</li>
        <li>Replication lag (if you have replicas). Past a few seconds is a sign of WAL backpressure.</li>
        <li>Cache hit ratio (<code>blks_hit / blks_hit + blks_read</code>). Should be over 95% for hot data.</li>
      </ul>

      <ArticleH2 id="tooling">Tooling that ships</ArticleH2>

      <h3>Provider dashboards</h3>
      <p>
        Supabase and Neon both ship per-project query and connection
        dashboards. Good for spot-checking; not the place to set up alerts.
      </p>

      <h3>Grafana + a Postgres exporter</h3>
      <p>
        The reference open-source stack. <code>postgres_exporter</code>{" "}
        scrapes pg_stat views; Prometheus stores; Grafana renders. Plenty
        of pre-built dashboards exist. Self-hosted or hosted Grafana Cloud.
      </p>

      <h3>pganalyze, Crunchy Insights, Datadog Database Monitoring</h3>
      <p>
        Specialised products. pganalyze in particular is genuinely good at
        surfacing the &quot;these queries got slower this week&quot;
        narrative without you having to set up dashboards yourself. Worth
        the cost for teams past a certain scale.
      </p>

      <h3>An admin tool with audit + history</h3>
      <p>
        Operational observability isn&apos;t just metrics. When something
        looks weird in production, the question is often &quot;who or what
        changed this row last week?&quot; A tool with a row-level history
        panel beats grepping logs.
      </p>

      <ArticleH2 id="alerts">Alerts to set up</ArticleH2>
      <p>Minimal alert set. Each one has a specific action:</p>
      <ol>
        <li><strong>Disk space &lt; 20%</strong>: free space or grow it.</li>
        <li><strong>Active connections &gt; 80% of max</strong>: investigate pooling.</li>
        <li><strong>Replication lag &gt; 10 seconds</strong>: check WAL throughput.</li>
        <li><strong>Idle-in-transaction connection &gt; 10 minutes</strong>: someone left a tab open; kill it.</li>
        <li><strong>p95 query latency on a critical query &gt; threshold</strong>: regression.</li>
        <li><strong>Autovacuum lag (dead_tup growing)</strong>: tune per-table settings.</li>
        <li><strong>Backup completion failed</strong>: highest priority. Investigate.</li>
      </ol>

      <Callout variant="sparkle" title="The minimum viable stack">
        pg_stat_statements + auto_explain enabled. Provider dashboard
        bookmarked. One alert per item above. Quarterly review of the top
        20 queries. That&apos;s most of the value of database
        observability, at almost no infrastructure cost.
      </Callout>
    </>
  );
}
