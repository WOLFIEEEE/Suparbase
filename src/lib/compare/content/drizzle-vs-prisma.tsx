import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "drizzle-vs-prisma",
  leftName: "Drizzle",
  rightName: "Prisma",
  title: "Drizzle vs Prisma in 2026",
  description:
    "The TypeScript ORM choice that decides how much your AI agent fights you. Honest 2026 comparison of Drizzle and Prisma.",
  tldr:
    "Drizzle is closer to raw SQL with end-to-end types; Prisma is higher-abstraction with a query client. Drizzle wins for AI-paired projects and edge runtimes. Prisma wins for teams that want a managed migration story and don't mind the runtime.",
  callouts: [
    { context: "AI-paired coding", winner: "Drizzle" },
    { context: "Edge / Cloudflare Workers", winner: "Drizzle" },
    { context: "Large teams with junior devs", winner: "Prisma" },
    { context: "Postgres extensions / raw SQL", winner: "Drizzle" },
  ],
  matrix: [
    { feature: "Query API", left: "SQL-shaped fluent builder", right: "Higher-level findMany / create" },
    { feature: "Type generation", left: "Inferred from schema.ts", right: "Generated client from schema.prisma" },
    { feature: "Migration tooling", left: "drizzle-kit (push or generate)", right: "Prisma Migrate" },
    { feature: "Bundle size on the edge", left: "Tiny", right: "Larger (includes query engine)" },
    { feature: "Postgres extensions", left: "Direct SQL access", right: "Partial (preview features)" },
    { feature: "Vendor support", left: "Postgres, MySQL, SQLite, Neon, Turso, D1", right: "Postgres, MySQL, SQLite, MongoDB" },
    { feature: "Schema-as-code language", left: "TypeScript", right: "Custom .prisma DSL" },
    { feature: "Studio / admin UI", left: "drizzle-studio", right: "Prisma Studio" },
    { feature: "AI-agent friendliness", left: "Very high (TS schema)", right: "High (generated types)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-drizzle-wins">When Drizzle wins</ArticleH2>
      <ul>
        <li>
          You&apos;re writing TypeScript anyway and want one source of truth for schema + types. Drizzle&apos;s
          schema is just a <code>.ts</code> file.
        </li>
        <li>
          You&apos;re on the edge: Cloudflare Workers, Vercel Edge, Deno. Drizzle bundles tiny; Prisma&apos;s
          query engine adds weight.
        </li>
        <li>
          You want to use Postgres-specific features (jsonb operators, full-text search, lateral joins,
          pgvector) without fighting an abstraction.
        </li>
        <li>
          You&apos;re vibe-coding. The agent reads <code>schema.ts</code> directly and produces correct
          queries first try.
        </li>
      </ul>

      <ArticleH2 id="when-prisma-wins">When Prisma wins</ArticleH2>
      <ul>
        <li>
          You have a larger team with mixed seniority. Prisma&apos;s higher abstraction prevents some
          footguns juniors find with raw SQL.
        </li>
        <li>
          You value the managed migration workflow. Prisma Migrate&apos;s opinions are good defaults.
        </li>
        <li>
          You need MongoDB and Postgres in the same codebase with one API. Prisma supports both; Drizzle
          is SQL-only.
        </li>
        <li>
          You&apos;re shipping on traditional servers (Node, not edge) and bundle size doesn&apos;t pinch.
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        For greenfield TypeScript + Postgres projects in 2026, Drizzle is the default. Its schema-as-TS,
        SQL-close API, and tiny bundle size match how teams actually want to work. Prisma is still excellent;
        for organisations that prefer the higher abstraction and the managed workflow, nothing about it has
        gotten worse. The question isn&apos;t which is better in some absolute sense, but which style fits
        your codebase.
      </p>
    </>
  );
}
