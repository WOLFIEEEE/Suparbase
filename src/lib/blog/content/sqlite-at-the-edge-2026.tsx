import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "sqlite-at-the-edge-2026",
  title: "SQLite at the Edge in 2026: Turso, libSQL, D1, and the Renaissance",
  description:
    "Why SQLite is suddenly winning workloads that used to belong to Postgres. Turso, libSQL, Cloudflare D1 explained, when to pick each, and the limits to know about.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["sqlite", "turso", "edge", "databases"],
  related: ["which-database-for-vibe-coding-2026", "edge-databases-comparison-2026", "postgres-connection-pooling-2026"],
  toc: [
    { id: "the-comeback", label: "Why SQLite is having a moment" },
    { id: "what-changed", label: "What actually changed in 2023-2026" },
    { id: "turso-libsql", label: "Turso and libSQL" },
    { id: "cloudflare-d1", label: "Cloudflare D1" },
    { id: "limits", label: "The limits that haven't gone away" },
    { id: "when-sqlite-wins", label: "When SQLite wins" },
    { id: "vibe-coding-sqlite", label: "Vibe-coding with SQLite" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        SQLite was always the &quot;just for local dev&quot; database. In
        2026 it&apos;s genuinely competing for production workloads against
        Postgres, MongoDB, and DynamoDB. The reason isn&apos;t that SQLite
        got bigger; it&apos;s that the world realised most workloads were
        smaller than they pretended to be.
      </p>

      <p>
        Here&apos;s where SQLite actually fits in 2026, what Turso /
        libSQL / D1 added, and the limits that still matter.
      </p>

      <ArticleH2 id="the-comeback">Why SQLite is having a moment</ArticleH2>

      <p>Three threads converged:</p>

      <ol>
        <li>
          <strong>Edge compute</strong> made &quot;run the database on the
          same box as the function&quot; viable. SQLite is the only mature
          database that runs in 10MB of memory and starts in microseconds.
        </li>
        <li>
          <strong>The serverless connection problem</strong> burned everyone
          enough times that &quot;no connection&quot; (just an in-process
          file or HTTP-based API) started looking attractive.
        </li>
        <li>
          <strong>Replication</strong> finally became a solved problem for
          SQLite in 2023 (Litestream, then LiteFS, then libSQL). Suddenly
          SQLite could be replicated, backed up continuously, and
          distributed across regions.
        </li>
      </ol>

      <p>
        The result: a class of workloads that used to need Postgres now
        runs perfectly on SQLite-shaped systems.
      </p>

      <ArticleH2 id="what-changed">What actually changed in 2023-2026</ArticleH2>

      <h3>libSQL (open-source SQLite fork)</h3>

      <p>
        Turso shipped libSQL in 2023 as a community-maintained fork of
        SQLite with the features SQLite chooses not to add: native HTTP
        access, embedded replicas, server-side functions. By 2025 it was
        the de facto choice for &quot;SQLite as a service&quot;.
      </p>

      <h3>Litestream and LiteFS for self-hosters</h3>

      <p>
        Ben Johnson&apos;s tools that backed up SQLite continuously to S3
        (Litestream) and replicated SQLite across nodes (LiteFS) changed
        what was operationally possible. Even if you don&apos;t use them
        directly, the tooling pushed the conversation forward.
      </p>

      <h3>sqlite-vec, sqlite-vss, and friends</h3>

      <p>
        Vector search extensions matured. <code>sqlite-vec</code> in
        particular is fast enough that small-scale RAG on SQLite is
        viable. For per-user-database architectures, this is significant.
      </p>

      <h3>Production replication patterns</h3>

      <p>
        The shape that won: a primary database (write path) plus embedded
        replicas everywhere else (read path). Reads happen locally with no
        network call; writes round-trip to the primary. For read-heavy
        apps with strong consistency tolerance, this is a quiet
        revolution.
      </p>

      <ArticleH2 id="turso-libsql">Turso and libSQL</ArticleH2>

      <p>
        Turso is a managed libSQL platform with a generous free tier and
        a strong per-database isolation story. The headline feature:
        you can create <em>thousands</em> of databases per account.
        Each one is genuinely a separate SQLite file (logically) with its
        own RLS-equivalent isolation.
      </p>

      <p>What Turso gets right:</p>

      <ul>
        <li>
          <strong>Database-per-user as a pricing tier</strong>. For consumer
          apps where each user&apos;s data is isolated, Turso&apos;s
          economics are unbeatable.
        </li>
        <li>
          <strong>Embedded replicas</strong>. Your app holds a local replica
          synced from the primary; reads are local SQLite (microseconds);
          writes go remote (millis).
        </li>
        <li>
          <strong>Branching</strong>. Like Neon for SQLite. Preview
          environments get their own database fork.
        </li>
      </ul>

      <p>What to know going in:</p>

      <ul>
        <li>
          Write concurrency per database is still SQLite-bounded. Two
          writers contending on one database serialise.
        </li>
        <li>
          ACID transactions still work, but distributed transactions
          across many databases are not Turso&apos;s model. Design
          around it.
        </li>
        <li>
          The libSQL TypeScript client is well-typed but doesn&apos;t have
          the corpus depth that postgres-js or Prisma do.
        </li>
      </ul>

      <ArticleH2 id="cloudflare-d1">Cloudflare D1</ArticleH2>

      <p>
        D1 is Cloudflare&apos;s SQLite-on-the-edge offering, bundled with
        their Workers platform. The pitch: if your compute already lives
        on Cloudflare, your database can live in the same data centre as
        the request.
      </p>

      <p>What D1 gets right:</p>

      <ul>
        <li>
          Latency floor at the edge is hard to beat. Single-digit
          milliseconds from any region.
        </li>
        <li>
          Tight Workers integration: bindings, no connection strings, no
          IAM dance.
        </li>
        <li>
          Generous free tier; pricing scales smoothly.
        </li>
      </ul>

      <p>What to know:</p>

      <ul>
        <li>
          D1 is most attractive when the rest of your stack is on
          Cloudflare. If you&apos;re running on Vercel or AWS, the
          cross-cloud round-trip cost cancels most of D1&apos;s edge
          benefit.
        </li>
        <li>
          Write throughput per database is limited. D1 is read-optimised.
        </li>
        <li>
          Migrations are functional but less mature than Drizzle Kit on
          Postgres.
        </li>
      </ul>

      <ArticleH2 id="limits">The limits that haven&apos;t gone away</ArticleH2>

      <p>SQLite is good at a lot of things. It is not magic.</p>

      <ul>
        <li>
          <strong>One writer at a time per database</strong>. Concurrent
          writes serialise. Workloads where many clients write the same
          database at once (chat apps with hot rooms, ad-tech ingestion)
          still want Postgres.
        </li>
        <li>
          <strong>No real row-level security</strong>. SQLite doesn&apos;t
          have RLS. Turso&apos;s database-per-tenant model is the
          workaround.
        </li>
        <li>
          <strong>Smaller extension ecosystem</strong>. There&apos;s no
          libSQL equivalent of <code>pg_partman</code> or PostGIS at parity.
        </li>
        <li>
          <strong>No native server-side aggregates across many databases</strong>.
          If you need analytics across thousands of per-user databases,
          you&apos;ll be writing a sidecar pipeline.
        </li>
      </ul>

      <ArticleH2 id="when-sqlite-wins">When SQLite wins</ArticleH2>

      <p>
        Concrete workloads where we&apos;d pick a SQLite-shaped database
        over Postgres in 2026:
      </p>

      <ul>
        <li>
          <strong>Notes apps, personal CRMs, agent-per-user products</strong>:
          per-user isolation + low write rate per user. Turso owns this.
        </li>
        <li>
          <strong>Documentation sites + read-heavy CMS</strong>: embedded
          replicas + microsecond reads. Local-first for static-leaning
          sites.
        </li>
        <li>
          <strong>Edge functions on Cloudflare</strong>: D1 + Workers as a
          stack is unbeatable for latency.
        </li>
        <li>
          <strong>Desktop apps and CLIs that ship with embedded data</strong>:
          SQLite has been the only credible answer here for decades, and
          libSQL adds optional sync.
        </li>
        <li>
          <strong>Test fixtures and ephemeral environments</strong>:
          spin-up cost is zero.
        </li>
      </ul>

      <Callout variant="tip" title="The hybrid is fine">
        Plenty of teams in 2026 run both: Postgres for the main app and
        Turso for per-user data (or vice versa). The agent doesn&apos;t
        mind. The user doesn&apos;t mind. Pick the right tool per shape;
        don&apos;t force one database into both molds.
      </Callout>

      <ArticleH2 id="vibe-coding-sqlite">Vibe-coding with SQLite</ArticleH2>

      <p>
        AI agents are surprisingly good at SQLite work, partly because the
        corpus of SQLite code on the public internet is enormous (every
        SQLite tutorial ever written), and partly because the surface is
        small.
      </p>

      <p>The patterns that work:</p>

      <ul>
        <li>
          Use <code>drizzle-orm/libsql</code> or <code>drizzle-orm/sqlite</code>
          with generated types. The agent reads them and produces correct
          queries first try.
        </li>
        <li>
          Commit your schema file as the canonical source of truth. The
          agent reads it every turn.
        </li>
        <li>
          Embed a local SQLite for tests; spin up a fresh database per
          test file. Agents love deterministic environments.
        </li>
        <li>
          For Turso specifically, the embedded replica pattern means your
          agent&apos;s local dev experience and your production read path
          are the same code. That alignment is unique.
        </li>
      </ul>

      <p>
        The SQLite renaissance is one of the more genuinely surprising
        platform shifts of the LLM era. A 25-year-old database, mostly
        unchanged at its core, is now winning workloads that the latest
        cloud-native systems are designed for. That&apos;s not nostalgia;
        it&apos;s a real architectural fit. Worth knowing where it applies.
      </p>
    </>
  );
}
