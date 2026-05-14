import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-vs-mongodb",
  leftName: "Postgres",
  rightName: "MongoDB",
  title: "Postgres vs MongoDB: 2026 Comparison",
  description:
    "Relational vs document. Honest 2026 comparison of Postgres and MongoDB: where each wins, where the JSONB column changes the calculus, and the workloads we'd still pick MongoDB for.",
  tldr:
    "Postgres wins if your data has a stable shape and relationships matter. MongoDB wins for genuinely document-shaped workloads (deeply nested content, polymorphic events). In 2026, Postgres + jsonb handles 90% of the cases people used to pick MongoDB for.",
  callouts: [
    { context: "Most SaaS / web apps", winner: "Postgres" },
    { context: "CMS with deeply nested content", winner: "MongoDB" },
    { context: "Per-tenant scaling with sharding", winner: "MongoDB" },
    { context: "AI-paired development", winner: "Postgres" },
  ],
  matrix: [
    { feature: "Data model", left: "Relational tables + jsonb columns", right: "Document collections" },
    { feature: "Query language", left: "SQL", right: "MQL + aggregation pipelines" },
    { feature: "Transactions", left: "ACID across rows/tables", right: "ACID across documents (4.0+)" },
    { feature: "Schema enforcement", left: "Strict by default; jsonb for flex", right: "Schema-less; opt-in validation" },
    { feature: "Joins", left: "First-class, planner-optimised", right: "$lookup; second-class" },
    { feature: "Sharding", left: "Citus / app-layer", right: "Built-in, mature" },
    { feature: "Type-gen for clients", left: "Drizzle, Prisma, sqlc", right: "Mongoose, Prisma Mongo connector" },
    { feature: "Vector search", left: "pgvector (mature)", right: "Atlas Vector Search" },
    { feature: "AI agent friendliness", left: "High (introspection + types)", right: "Medium (inferred shape)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-postgres-wins">When Postgres wins</ArticleH2>
      <ul>
        <li>
          Your domain has stable entities with stable relationships. Users,
          orgs, projects, posts &mdash; classic SaaS shape.
        </li>
        <li>
          You need joins, aggregates, window functions for reporting and
          analytics.
        </li>
        <li>
          You want strong consistency by default.
        </li>
        <li>
          You&apos;re AI-paired. Postgres&apos;s introspection beats
          MongoDB&apos;s shape-by-sample for agent productivity.
        </li>
        <li>
          You&apos;ll have a few flexible-shape fields. JSONB columns
          handle them inside Postgres.
        </li>
      </ul>

      <ArticleH2 id="when-mongodb-wins">When MongoDB wins</ArticleH2>
      <ul>
        <li>
          Genuinely document-shaped data: CMS with deeply nested blocks,
          variant-attribute product catalogs, multi-vendor event streams.
        </li>
        <li>
          You&apos;re at 10B+ rows and need turn-key horizontal sharding.
        </li>
        <li>
          Your team is fluent in MongoDB and the operational story is
          easier than learning Postgres at scale.
        </li>
        <li>
          You&apos;re writing a mobile-first app and want Realm&apos;s sync
          on top.
        </li>
      </ul>

      <ArticleH2 id="the-jsonb-gotcha">The JSONB gotcha</ArticleH2>
      <p>
        Postgres&apos;s <code>jsonb</code> column type covers 90% of the
        cases people used to pick MongoDB for &mdash; flexible attributes,
        sparse fields, third-party payloads. With functional indexes you can
        even query JSON keys as if they were real columns. The remaining 10%
        (deeply nested writes against the same document at high concurrency)
        is where MongoDB still wins cleanly.
      </p>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        We&apos;d pick Postgres for most new projects in 2026. The combination
        of strict schema + jsonb escape hatch + the entire ecosystem
        (extensions, ORMs, observability, AI-agent friendliness) is hard to
        beat. MongoDB is still the right answer for a specific shape of
        workload, but it&apos;s a narrower shape than the marketing suggests.
      </p>
      <p>
        If you&apos;re currently on MongoDB and considering a migration,
        the question isn&apos;t &quot;is Postgres better in general&quot; &mdash;
        it&apos;s &quot;is the engineering cost of migration worth the
        operational savings and the developer-experience gains?&quot; The
        answer is usually yes if you&apos;re past the prototype phase, no
        if you&apos;re shipping in a year.
      </p>
    </>
  );
}
