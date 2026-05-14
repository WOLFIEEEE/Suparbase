import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-vs-convex",
  leftName: "Supabase",
  rightName: "Convex",
  title: "Supabase vs Convex in 2026",
  description:
    "Postgres + REST + RLS vs reactive functions + TypeScript-first backend. Honest 2026 comparison of Supabase and Convex.",
  tldr:
    "Supabase is Postgres with bundled services and RLS as authz. Convex is a reactive backend with TypeScript queries / mutations / actions, where the database is part of the framework. Pick Supabase for SQL + portability. Pick Convex for real-time-everywhere apps where you'd otherwise build a custom server.",
  callouts: [
    { context: "SQL workflow", winner: "Supabase" },
    { context: "Real-time-everywhere UX", winner: "Convex" },
    { context: "Portability / open source", winner: "Supabase" },
    { context: "End-to-end TypeScript types", winner: "Convex" },
  ],
  matrix: [
    { feature: "Database", left: "Postgres", right: "Proprietary document store" },
    { feature: "Query language", left: "SQL", right: "TypeScript queries (custom DSL)" },
    { feature: "Live subscriptions", left: "Postgres replication via Realtime", right: "Every query is reactive by default" },
    { feature: "Schema", left: "SQL DDL", right: "TypeScript schema (validators)" },
    { feature: "Authorization", left: "RLS (database-level)", right: "Server-side function checks" },
    { feature: "Self-hostable", left: "Yes (full stack)", right: "No (Convex Cloud only)" },
    { feature: "Migrations", left: "Drizzle / Prisma / Atlas", right: "Convex CLI" },
    { feature: "AI-agent friendliness", left: "Postgres introspection", right: "TS types are excellent" },
    { feature: "Vendor lock-in", left: "Low (Postgres is portable)", right: "High (proprietary platform)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-supabase-wins">When Supabase wins</ArticleH2>
      <ul>
        <li>
          You want SQL and the Postgres ecosystem. Period.
        </li>
        <li>
          You care about portability and self-hosting. Supabase is open; Convex isn&apos;t.
        </li>
        <li>
          You&apos;re building a CRUD-style B2B app where real-time is nice but not essential. RLS does
          the authz work for you.
        </li>
        <li>
          You want pgvector, pg_partman, PostGIS, or any of the other Postgres extensions Convex
          can&apos;t replicate.
        </li>
      </ul>

      <ArticleH2 id="when-convex-wins">When Convex wins</ArticleH2>
      <ul>
        <li>
          Real-time is core to your product UX. Collaborative editors, multiplayer apps, dashboards that
          should never need a refresh. Convex&apos;s &quot;every query is live&quot; default eliminates a
          whole class of bugs.
        </li>
        <li>
          You want end-to-end TypeScript without a database mental model in the middle. Convex&apos;s
          query/mutation/action functions are TS all the way down.
        </li>
        <li>
          You don&apos;t want to think about a database at all and you&apos;re OK with the proprietary
          platform.
        </li>
        <li>
          Your shape is genuinely document-y and the schema-as-Zod-validators feel is what you want.
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        Convex is a beautifully-designed product for a specific shape of app: reactive-by-default UIs with
        a TypeScript-first team. The trade-off is real lock-in. Supabase is the more boring,
        more-portable, more-flexible choice; if your app doesn&apos;t need every query to be live, you&apos;re
        usually better off with Postgres. The decision often comes down to how much you value real-time as
        a product feature vs. how much you value portability as an engineering one.
      </p>
    </>
  );
}
