import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-vs-pocketbase",
  leftName: "Supabase",
  rightName: "PocketBase",
  title: "Supabase vs PocketBase: 2026 Comparison",
  description:
    "PocketBase is a single binary; Supabase is a platform. The 2026 comparison: when the tiny self-hosted option wins, and when you actually want the full bundle.",
  tldr:
    "PocketBase is a single Go binary with SQLite, auth, files, realtime, and an admin UI baked in. Supabase is a Postgres-backed platform. Pick PocketBase for small, single-server side projects you want to own. Pick Supabase for anything that will outlive a weekend.",
  callouts: [
    { context: "Side project, self-host the binary", winner: "PocketBase" },
    { context: "Production SaaS", winner: "Supabase" },
    { context: "Postgres + RLS workflow", winner: "Supabase" },
    { context: "Zero-ops single binary", winner: "PocketBase" },
  ],
  matrix: [
    { feature: "Database", left: "Postgres", right: "SQLite (embedded)" },
    { feature: "Deployment", left: "Managed or Docker bundle", right: "Single Go binary" },
    { feature: "Realtime", left: "Postgres replication", right: "Built-in WebSocket" },
    { feature: "Auth", left: "GoTrue + JWT", right: "Bundled" },
    { feature: "Storage", left: "S3-compatible", right: "Local filesystem or S3" },
    { feature: "Schema migrations", left: "Drizzle, Prisma, Atlas", right: "Migrations CLI (basic)" },
    { feature: "RLS-style authorization", left: "Native Postgres RLS", right: "Collection rules (custom DSL)" },
    { feature: "Horizontal scaling", left: "Read replicas, branching", right: "Single writer (SQLite limit)" },
    { feature: "AI-agent friendliness", left: "Full schema introspection", right: "SQLite introspection works" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-pocketbase-wins">When PocketBase wins</ArticleH2>
      <ul>
        <li>
          You want one binary you can <code>scp</code> to a VPS and forget about. PocketBase is genuinely&nbsp;
          zero-ops in a way Supabase isn&apos;t.
        </li>
        <li>
          Your project is small enough that SQLite&apos;s single-writer limit doesn&apos;t matter. Personal
          tools, internal apps, weekend hacks.
        </li>
        <li>
          You don&apos;t want to think about a cloud bill or a sign-up flow.
        </li>
        <li>
          You like the bundled admin UI and don&apos;t need anything more.
        </li>
      </ul>

      <ArticleH2 id="when-supabase-wins">When Supabase wins</ArticleH2>
      <ul>
        <li>
          Your project has users with relationships and you want Postgres RLS as your authorization layer.
        </li>
        <li>
          You expect concurrent writes. SQLite&apos;s single-writer ceiling becomes a real problem under
          B2B SaaS load.
        </li>
        <li>
          You need the Postgres ecosystem: pgvector for RAG, pg_partman for time-series, replication,
          extensions, the works.
        </li>
        <li>
          You&apos;re vibe-coding. Agent productivity against Postgres is a real notch above SQLite for
          relational shapes.
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        PocketBase is a beautiful tool for a narrow use case: small, single-instance, self-hosted apps where
        the developer wants to own everything. We love it for personal tools. For a real product with users,
        Supabase&apos;s richer stack (Postgres + RLS + Realtime + Auth + Storage at scale) earns its
        complexity. The two aren&apos;t really competitors; they&apos;re sized for different jobs.
      </p>
    </>
  );
}
