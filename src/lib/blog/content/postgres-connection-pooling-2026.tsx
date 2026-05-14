import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-connection-pooling-2026",
  title: "Connection Pooling for Modern Postgres: pgBouncer, Supavisor, PgCat",
  description:
    "The 2026 state of Postgres connection pooling for serverless and traditional servers: pool modes, when transaction-mode breaks, prepared statements, and which pooler to pick.",
  publishedAt: "2026-05-13",
  updatedAt: "2026-05-14",
  readingMinutes: 14,
  tags: ["postgres", "pooling", "operations", "serverless"],
  related: ["multi-tenant-saas-postgres", "supabase-vs-self-hosted-postgres", "zero-downtime-migrations"],
  toc: [
    { id: "why-pool", label: "Why pool at all" },
    { id: "modes", label: "Pool modes: session, transaction, statement" },
    { id: "pgbouncer", label: "pgBouncer" },
    { id: "supavisor", label: "Supavisor" },
    { id: "pgcat", label: "PgCat" },
    { id: "rds-proxy", label: "RDS Proxy" },
    { id: "serverless", label: "The serverless pooling problem" },
    { id: "picking", label: "Picking one" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Postgres connections are heavy. Each one is a forked process with its
        own ~10MB of memory. Applications that open a connection per request
        die at 200 concurrent requests. The fix has always been a pooler,
        but in 2026 there are four credible options and the trade-offs have
        shifted, especially for serverless.
      </p>

      <p>This is what we actually run, and why.</p>

      <ArticleH2 id="why-pool">Why pool at all</ArticleH2>

      <p>
        Postgres&apos;s default <code>max_connections</code> is 100. Many
        managed providers cap it lower. A Next.js app on Vercel with even
        modest traffic can easily exceed that during a spike. Without
        pooling, your app hits &quot;too many connections&quot; and stalls
        until connections free up.
      </p>

      <p>
        Pooling fronts your database with a separate process that:
      </p>

      <ul>
        <li>Holds a small set of upstream connections to Postgres.</li>
        <li>Accepts many client connections from your app.</li>
        <li>Multiplexes client work over the upstream pool.</li>
      </ul>

      <p>
        The crucial question is <em>how</em> the pooler decides which client
        gets which upstream connection. That&apos;s pool mode.
      </p>

      <ArticleH2 id="modes">Pool modes: session, transaction, statement</ArticleH2>

      <h3>Session mode (default)</h3>

      <p>
        A client gets a dedicated upstream connection for the lifetime of its
        session. When the client disconnects, the upstream is returned to the
        pool. Same as having no pooler, basically — just with reuse across
        client sessions.
      </p>

      <p>
        Compatible with everything Postgres supports (prepared statements,
        session variables, advisory locks, <code>LISTEN/NOTIFY</code>).
        Doesn&apos;t solve the scaling problem because each client still
        holds a connection while idle.
      </p>

      <h3>Transaction mode</h3>

      <p>
        A client gets an upstream connection only for the duration of a
        transaction (or a single statement outside a transaction). At
        transaction commit, the connection returns to the pool and the next
        waiting client gets it.
      </p>

      <p>
        This is what gives you the scaling win. 10 upstream connections can
        serve 1000 concurrent clients if their transactions are short.
      </p>

      <p>
        The cost: session-scoped state breaks. You lose:
      </p>

      <ul>
        <li>
          <strong>Prepared statements</strong> (without protocol-level
          de-duplication, the next transaction won&apos;t see the prepare).
        </li>
        <li>
          <strong>Session variables</strong> (<code>SET search_path</code>,{" "}
          <code>SET application_name</code> are lost).
        </li>
        <li>
          <strong><code>LISTEN/NOTIFY</code></strong> (sessions can&apos;t
          listen on a connection they don&apos;t keep).
        </li>
        <li>
          <strong>Advisory locks held across transactions.</strong>
        </li>
      </ul>

      <Callout variant="watch-out" title="Prepared statements in transaction mode">
        The single most common gotcha. Your ORM (Drizzle, Prisma, postgres-js)
        uses prepared statements by default. In transaction mode, every
        prepare is wasted because the next transaction is on a different
        upstream connection. Either turn off prepared statements (
        <code>prepare: false</code> in postgres-js, similar flags in other
        clients) or pick a pooler that handles prepared statement
        deduplication (PgCat, Supavisor v2).
      </Callout>

      <h3>Statement mode</h3>

      <p>
        The pooler releases the upstream connection after every statement.
        Transactions are forbidden. Used by exactly nobody.
      </p>

      <ArticleH2 id="pgbouncer">pgBouncer</ArticleH2>

      <p>
        The grandparent. Single-threaded C, rock-solid, runs on tiny VMs.
        Used at meaningful scale for two decades. The reference implementation
        of transaction pooling.
      </p>

      <p>What pgBouncer is great at:</p>

      <ul>
        <li>Latency: ~0.1ms overhead per query.</li>
        <li>Resource footprint: a single 32MB pgBouncer handles 10k+ clients.</li>
        <li>Predictability: it does one thing and it&apos;s well-understood.</li>
      </ul>

      <p>Where it&apos;s showing its age:</p>

      <ul>
        <li>
          Single-threaded. CPU-bound for very high QPS workloads (past ~50k
          queries/sec on a single instance).
        </li>
        <li>
          No prepared statement handling: in transaction mode you need to
          disable client-side prepare.
        </li>
        <li>
          Configuration via flat file. No dynamic pool reconfiguration; you
          reload to change a pool size.
        </li>
        <li>
          No read replica routing.
        </li>
      </ul>

      <p>
        Still our default for most self-hosted Postgres deploys. Reliable,
        boring, fast.
      </p>

      <ArticleH2 id="supavisor">Supavisor</ArticleH2>

      <p>
        Supabase&apos;s pooler. Written in Elixir, multi-tenant out of the
        box, designed for the &quot;Supabase project per customer&quot;
        shape. The default pooler on every Supabase project.
      </p>

      <p>What Supavisor brings:</p>

      <ul>
        <li>
          <strong>Multi-tenant native</strong>. A single Supavisor cluster
          can pool for thousands of databases, each with its own pool config.
          This is genuinely a game-changer for the &quot;database per
          tenant&quot; pattern.
        </li>
        <li>
          <strong>Prepared statement deduplication</strong>. Supavisor v2
          (mid-2025) handles prepared statements at the protocol level, so
          you can leave <code>prepare: true</code> on in your ORM and still
          use transaction mode.
        </li>
        <li>
          <strong>Connection upgrade per request</strong>: a request that
          needs session-scoped state can be promoted from transaction-mode
          to session-mode on the same connection.
        </li>
        <li>
          <strong>Horizontal scaling</strong>: Erlang/OTP gives Supavisor the
          ability to run as a cluster across multiple nodes.
        </li>
      </ul>

      <p>The trade-offs:</p>

      <ul>
        <li>
          Higher per-query overhead than pgBouncer (1-2ms typically),
          because of the Erlang runtime.
        </li>
        <li>
          Bigger memory footprint per instance.
        </li>
        <li>
          Tied to Supabase&apos;s release cadence if you&apos;re using it
          on-platform; self-hosting it is possible but less common.
        </li>
      </ul>

      <p>
        If you&apos;re on managed Supabase, you&apos;re already on Supavisor.
        Use the transaction-mode endpoint (port 6543) for serverless workloads
        and the session-mode endpoint (port 5432) for traditional servers
        that benefit from session-scoped state.
      </p>

      <ArticleH2 id="pgcat">PgCat</ArticleH2>

      <p>
        Rust pooler, came out of Instacart and matured rapidly in 2024-2025.
        Multi-threaded, transaction mode by default, supports read replica
        routing and sharding.
      </p>

      <p>Why pick PgCat:</p>

      <ul>
        <li>
          <strong>Multi-threaded</strong>: scales further than pgBouncer on
          a single instance.
        </li>
        <li>
          <strong>Read replica routing</strong>: routes <code>SELECT</code>{" "}
          to replicas, writes to primary. Configurable per role.
        </li>
        <li>
          <strong>Sharding</strong>: built-in support for application-level
          sharding via a query rewrite layer.
        </li>
        <li>
          <strong>Prepared statement support</strong>: similar to Supavisor,
          PgCat handles client-side prepares correctly.
        </li>
      </ul>

      <p>Where it&apos;s less mature:</p>

      <ul>
        <li>
          Configuration is more complex than pgBouncer&apos;s flat file. You
          need to think about pools, shards, and roles.
        </li>
        <li>
          Smaller community. When something breaks, you&apos;re reading
          Rust source, not stack overflow answers.
        </li>
      </ul>

      <p>
        We pick PgCat when we need read-replica routing or sharding. For
        flat Postgres workloads, pgBouncer is still simpler.
      </p>

      <ArticleH2 id="rds-proxy">RDS Proxy</ArticleH2>

      <p>
        If you&apos;re on AWS RDS or Aurora, RDS Proxy is the bundled answer.
        It runs as a managed service, IAM-aware, transaction-mode pooling
        with prepared statement support.
      </p>

      <p>
        It works. The cost is significant ($0.024/instance-hour per vCPU you
        provision, on top of the database). The latency is fine (~1-2ms
        overhead). The lock-in is real.
      </p>

      <p>
        Use it if you&apos;re already on RDS and don&apos;t want to operate
        a pooler. Use it begrudgingly.
      </p>

      <ArticleH2 id="serverless">The serverless pooling problem</ArticleH2>

      <p>
        Serverless platforms (Vercel, Cloudflare Workers, Netlify) start
        and tear down compute frequently. Each cold start would naively open
        a fresh connection. Without a pooler, this saturates Postgres in
        minutes under any real traffic.
      </p>

      <p>
        The shape that works:
      </p>

      <ol>
        <li>
          Your serverless function opens a connection to a <em>transaction-
          mode pooler</em> (Supavisor or pgBouncer in tx mode).
        </li>
        <li>
          The pooler holds a small set of upstream connections to Postgres
          (10-50 is usually enough).
        </li>
        <li>
          Your function runs its query in a transaction. At commit, the
          pooler returns the upstream connection.
        </li>
        <li>
          Your function ends. Its connection to the pooler closes. The
          upstream connection is unaffected.
        </li>
      </ol>

      <CodeBlock language="ts" filename="serverless-config.ts">{`// postgres-js + Supavisor transaction mode (Vercel example).
const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,            // one connection per function invocation.
  prepare: false,    // critical for transaction-mode pooling on pgBouncer.
                     // (Supavisor v2 handles prepare itself, so you can flip
                     // this back to true if you point at it directly.)
  idle_timeout: 0,   // release immediately after the request.
});`}</CodeBlock>

      <h3>The HTTP shortcut</h3>

      <p>
        Neon introduced &quot;serverless driver&quot; in 2023: a Postgres
        client that speaks HTTP/WebSocket instead of the wire protocol. No
        connection state. Every query is a one-off HTTP request to Neon&apos;s
        proxy, which fans out to a tiny per-database connection pool on its
        side.
      </p>

      <p>
        For pure serverless workloads with simple queries (no transactions
        spanning multiple statements, no prepared statements), this is the
        cleanest answer. Supabase shipped a similar option in 2025.
      </p>

      <p>
        For workloads that need real transactions or session state, you still
        want a pooler.
      </p>

      <ArticleH2 id="picking">Picking one</ArticleH2>

      <p>Our defaults:</p>

      <ul>
        <li>
          <strong>Managed Supabase project</strong>: Supavisor in transaction
          mode (port 6543). It&apos;s included; don&apos;t fight the platform.
        </li>
        <li>
          <strong>Self-hosted Postgres + Vercel</strong>: pgBouncer in
          transaction mode, with <code>prepare: false</code> in your driver.
        </li>
        <li>
          <strong>Self-hosted Postgres + read replicas</strong>: PgCat for the
          read/write split.
        </li>
        <li>
          <strong>Database per tenant</strong>: Supavisor — its multi-tenant
          architecture is the killer feature.
        </li>
        <li>
          <strong>Neon</strong>: their serverless driver for serverless
          workloads, their bundled pooler for traditional servers.
        </li>
      </ul>

      <p>
        Whatever you pick, audit your prepared-statement story. The single
        most common &quot;why is everything slow?&quot; cause in a properly-
        configured pooler is client-side prepare hammering an upstream
        connection on every transaction. Look up your ORM&apos;s docs for the
        right flag.
      </p>

      <p>
        And once you&apos;re past the pool decision, use the rest of your
        Postgres toolbox to actually see what&apos;s happening — connection
        counts in <code>pg_stat_activity</code>, queue depth in your pooler&apos;s
        admin console, slow queries in <code>pg_stat_statements</code>. The
        pool is a means; the database&apos;s health is the end. Tools like{" "}
        <Link href="/features">our SQL playground</Link> are useful here
        because you can run those introspection queries quickly with a
        read-only safety net.
      </p>
    </>
  );
}
