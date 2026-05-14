import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "edge-databases-comparison-2026",
  title: "Edge Databases Compared in 2026: Turso vs Cloudflare D1 vs Neon",
  description:
    "Three takes on \"database at the edge\" in 2026. Turso's SQLite-per-user, Cloudflare D1's Workers-native SQLite, and Neon's branched Postgres. When each one wins.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["edge", "neon", "turso", "cloudflare", "databases"],
  related: ["sqlite-at-the-edge-2026", "which-database-for-vibe-coding-2026", "supabase-vs-self-hosted-postgres"],
  toc: [
    { id: "what-edge-means", label: "What \"edge\" means here" },
    { id: "neon", label: "Neon" },
    { id: "turso", label: "Turso" },
    { id: "d1", label: "Cloudflare D1" },
    { id: "head-to-head", label: "Head to head" },
    { id: "the-real-question", label: "The real question" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Three databases. Three takes on &quot;data close to your users&quot;.
        All three matured significantly in 2025. In 2026 the question
        isn&apos;t which one is technically best — it&apos;s which one
        matches your application&apos;s shape.
      </p>

      <ArticleH2 id="what-edge-means">What &quot;edge&quot; means here</ArticleH2>

      <p>
        &quot;Edge database&quot; is a category with three distinct
        meanings, and the vendors overlap them in confusing ways:
      </p>

      <ol>
        <li>
          <strong>Globally-replicated reads</strong>. A primary that
          accepts writes; read replicas in every region. Latency on reads
          is local; latency on writes is to the primary.
        </li>
        <li>
          <strong>Local-first with eventual sync</strong>. The database
          lives in the same process as your application; writes happen
          locally and sync to a central source asynchronously.
        </li>
        <li>
          <strong>Per-tenant locality</strong>. Each customer&apos;s
          database is placed close to that customer. Different customers
          live in different regions.
        </li>
      </ol>

      <p>Each of our three picks emphasises a different one of these.</p>

      <ArticleH2 id="neon">Neon</ArticleH2>

      <p>
        <strong>Take</strong>: globally-replicated reads + branching.
        It&apos;s still Postgres; the &quot;edge&quot; story is that read
        replicas in multiple regions cut read latency for users far from
        your primary.
      </p>

      <p>What Neon nails:</p>

      <ul>
        <li>
          <strong>Branching</strong>. The killer feature. Every PR can get
          its own database fork; preview environments use the same data
          as production without affecting it.
        </li>
        <li>
          <strong>Autoscaling compute</strong>. Compute pauses when idle.
          Hobby projects effectively cost zero when nobody&apos;s using
          them.
        </li>
        <li>
          <strong>Serverless driver</strong>. HTTP-based Postgres client
          that skips connection pooling entirely for one-off queries. The
          right primitive for Vercel-style serverless.
        </li>
        <li>
          <strong>It&apos;s real Postgres</strong>. Extensions,
          tooling, ecosystem all work.
        </li>
      </ul>

      <p>What to know:</p>

      <ul>
        <li>
          Write latency from far regions still goes to the primary.
          &quot;Globally-replicated&quot; doesn&apos;t mean
          &quot;global writes&quot;.
        </li>
        <li>
          Cold-start on a paused branch is faster than it used to be but
          not zero (~300ms-1s).
        </li>
      </ul>

      <p>Pick if: you want Postgres, you want branching, you have
      world-spanning users.</p>

      <ArticleH2 id="turso">Turso</ArticleH2>

      <p>
        <strong>Take</strong>: per-tenant locality + embedded replicas.
        Each user (or each tenant) gets their own SQLite database. The
        application can hold an embedded replica that&apos;s synced from
        the primary; reads are local, writes go remote.
      </p>

      <p>What Turso nails:</p>

      <ul>
        <li>
          <strong>Database-per-user economics</strong>. Tens of thousands
          of databases per account on the free tier. For consumer apps
          with isolated user data, the model is genuinely unique.
        </li>
        <li>
          <strong>Embedded replicas</strong>. Your app holds a local copy
          of the database, synced from the primary. Reads are
          microseconds. Writes round-trip.
        </li>
        <li>
          <strong>SQLite&apos;s small surface</strong>. Easy to operate,
          easy for agents to understand.
        </li>
        <li>
          <strong>Branching</strong>. Per-database; preview environments
          can fork.
        </li>
      </ul>

      <p>What to know:</p>

      <ul>
        <li>
          One writer per database. Concurrent writes serialise. Hot
          rooms in a chat app, fast-moving order tables, etc. aren&apos;t
          a great fit unless you can shard.
        </li>
        <li>
          No row-level security as a Postgres-style primitive. Tenant
          isolation comes from the database-per-tenant model.
        </li>
        <li>
          Smaller ecosystem than Postgres. The fundamentals are there;
          the niche tooling is thinner.
        </li>
      </ul>

      <p>Pick if: you have a per-user data model (notes app, personal CRM,
      single-player creative tools).</p>

      <ArticleH2 id="d1">Cloudflare D1</ArticleH2>

      <p>
        <strong>Take</strong>: SQLite living in Cloudflare&apos;s edge
        network, bound directly into Workers. Your database is a binding,
        not a connection string.
      </p>

      <p>What D1 nails:</p>

      <ul>
        <li>
          <strong>Latency floor at the edge</strong>. Single-digit ms
          from any region when paired with Workers.
        </li>
        <li>
          <strong>Workers-native bindings</strong>. No connection pool,
          no IAM dance, no driver setup. The binding is in your code.
        </li>
        <li>
          <strong>Generous free tier</strong>. Pricing scales smoothly.
        </li>
        <li>
          <strong>Schema migrations</strong> via wrangler are functional.
        </li>
      </ul>

      <p>What to know:</p>

      <ul>
        <li>
          D1 is tied to Cloudflare. If your compute is on Vercel or AWS,
          the cross-cloud round-trip cost cancels the edge benefit.
        </li>
        <li>
          Write throughput per database is capped. D1 is read-optimised.
        </li>
        <li>
          The ecosystem of libraries, ORMs, type-gen is improving but
          not at libSQL or Postgres parity.
        </li>
      </ul>

      <p>Pick if: you&apos;re all-in on the Cloudflare stack.</p>

      <ArticleH2 id="head-to-head">Head to head</ArticleH2>

      <p>The trade-offs side by side:</p>

      <ul>
        <li>
          <strong>Real Postgres</strong>: Neon. The other two are SQLite.
        </li>
        <li>
          <strong>RLS-style authorization</strong>: Neon. The other two
          rely on the database-per-tenant pattern or application-level
          checks.
        </li>
        <li>
          <strong>Per-user databases at scale</strong>: Turso.
        </li>
        <li>
          <strong>Lowest edge latency</strong>: D1 (when you&apos;re on
          Workers).
        </li>
        <li>
          <strong>Branching for preview environments</strong>: Neon and
          Turso both. D1 is catching up.
        </li>
        <li>
          <strong>Free tier generosity</strong>: all three. They&apos;ve
          all converged on &quot;free for hobby projects, pay when you
          have users&quot;.
        </li>
        <li>
          <strong>Vector search</strong>: Neon (pgvector). Turso has
          sqlite-vec; D1 doesn&apos;t natively.
        </li>
        <li>
          <strong>Ecosystem maturity</strong>: Neon &gt; Turso &gt; D1, in
          that order, by some distance.
        </li>
      </ul>

      <Callout variant="tip" title="The hosting-platform tie-in usually decides">
        The answer most teams converge on isn&apos;t &quot;which database
        is best&quot;; it&apos;s &quot;which database lives where my
        compute lives&quot;. Vercel + Neon, Cloudflare + D1,
        Fly/Railway/anywhere + Turso. Cross-cloud round-trip costs
        usually outweigh any benchmark difference.
      </Callout>

      <ArticleH2 id="the-real-question">The real question</ArticleH2>

      <p>
        For most projects, the actual decision isn&apos;t edge vs not-edge.
        It&apos;s &quot;do I have global users whose latency I care
        about?&quot;
      </p>

      <p>
        If yes, edge databases earn their keep. Pick the one that matches
        your stack and your tenancy model.
      </p>

      <p>
        If no — most B2B SaaS, internal tools, regional consumer apps —
        a regular Postgres on Supabase or Neon is faster, simpler, and
        cheaper than any of the three. The edge story is a real win for a
        real set of workloads, but it&apos;s not most workloads. Optimise
        for what you actually have.
      </p>
    </>
  );
}
