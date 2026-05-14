import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-vs-mysql-2026",
  leftName: "Postgres",
  rightName: "MySQL",
  title: "Postgres vs MySQL in 2026",
  description:
    "Two relational databases, both production-ready, both with strong ecosystems. The honest 2026 comparison: where each one wins and how the gap has changed.",
  tldr:
    "Postgres wins on features, extensions, JSON support, and developer experience. MySQL wins on horizontal scale-out via Vitess and on operational simplicity at very large traffic. For new projects in 2026, Postgres is the default.",
  callouts: [
    { context: "New SaaS project", winner: "Postgres" },
    { context: "Massive write-heavy scale", winner: "MySQL (Vitess)" },
    { context: "JSON + relational hybrid", winner: "Postgres" },
    { context: "AI-paired development", winner: "Postgres" },
  ],
  matrix: [
    { feature: "JSON support", left: "jsonb with indexing", right: "JSON type (slower indexing)" },
    { feature: "Window functions / CTEs", left: "First-class", right: "Available, slightly clunkier" },
    { feature: "Extensions", left: "Huge ecosystem (pgvector, PostGIS…)", right: "Plugin model, fewer modern picks" },
    { feature: "Replication", left: "Streaming + logical", right: "Statement / binlog / GTID" },
    { feature: "Horizontal scaling", left: "Citus, partitioning", right: "Vitess (mature)" },
    { feature: "Default isolation", left: "Read committed", right: "Repeatable read" },
    { feature: "Type system", left: "Strict, custom types possible", right: "More permissive coercions" },
    { feature: "Vendor ecosystem (2026)", left: "Supabase, Neon, Crunchy, RDS", right: "PlanetScale, RDS, MariaDB" },
    { feature: "AI-agent friendliness", left: "High (clean introspection)", right: "High (similar story)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-postgres-wins">When Postgres wins</ArticleH2>
      <ul>
        <li>
          Your domain mixes relational and document data. <code>jsonb</code> is the killer feature MySQL
          hasn&apos;t matched.
        </li>
        <li>
          You write analytical queries against operational data. Postgres&apos;s window functions, CTEs,
          and planner pull ahead.
        </li>
        <li>
          You want pgvector for RAG without standing up a second system.
        </li>
        <li>
          You&apos;re building on Supabase, Neon, or any of the modern Postgres-first platforms.
        </li>
      </ul>

      <ArticleH2 id="when-mysql-wins">When MySQL wins</ArticleH2>
      <ul>
        <li>
          You&apos;re past the scale where a single-writer Postgres fits, and Vitess&apos;s sharding story is
          simpler than Citus for your team.
        </li>
        <li>
          You&apos;re already on AWS Aurora MySQL and the operational team is fluent.
        </li>
        <li>
          Your team genuinely prefers MySQL&apos;s quirks (silent type coercion, the way GROUP BY works
          before strict mode).
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        Postgres has been the default for new projects since roughly 2020. The 2026 question isn&apos;t
        whether Postgres &quot;won&quot; (it did, for most purposes); it&apos;s whether MySQL&apos;s
        operational advantages at extreme scale still matter for your project. For 95% of new SaaS, the
        answer is no, and Postgres is the calmer choice. For the 5% that genuinely need Vitess-scale
        sharding, MySQL still ships.
      </p>
    </>
  );
}
