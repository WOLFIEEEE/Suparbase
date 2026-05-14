import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "type-safe-database-for-ai-paired-code",
  title: "Type-Safe Database Access for AI-Paired Codebases",
  description:
    "Why type-safety isn't optional when an AI writes most of your code. Drizzle vs Prisma vs Kysely vs sqlc compared for the AI-paired workflow.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["typescript", "drizzle", "prisma", "ai"],
  related: ["best-ai-friendly-database-2026", "cursor-plus-supabase-2026", "vibe-coding-database-patterns"],
  toc: [
    { id: "why-types-matter-more", label: "Why types matter more, not less" },
    { id: "the-options", label: "The 2026 options" },
    { id: "drizzle", label: "Drizzle" },
    { id: "prisma", label: "Prisma" },
    { id: "kysely", label: "Kysely" },
    { id: "sqlc", label: "sqlc" },
    { id: "verdict", label: "Verdict" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        When an AI agent writes 80% of your code, type-safety stops being a
        nice-to-have and becomes a load-bearing element. The agent reads
        types as truth; if your types are wrong, the agent confidently
        ships wrong code.
      </p>

      <ArticleH2 id="why-types-matter-more">Why types matter more, not less</ArticleH2>
      <p>
        In a human-written codebase, types are documentation plus a partial
        check. Most of your correctness lives in the developer&apos;s head.
        In an AI-paired codebase, the developer&apos;s head is dispersed
        across prompts; the types are the only authoritative shape the agent
        sees. Three consequences:
      </p>
      <ul>
        <li>
          A missing type or an <code>any</code> escape hatch becomes a black
          hole the agent fills with hallucinated columns.
        </li>
        <li>
          A generated type that&apos;s in <code>.gitignore</code> means the
          agent doesn&apos;t see it &mdash; you&apos;re back to schema-by-imagination.
        </li>
        <li>
          Types that lie (<code>Maybe&lt;User&gt;</code> that&apos;s never null in
          practice) train the agent to ignore them. Then it ignores the
          types that don&apos;t lie too.
        </li>
      </ul>

      <ArticleH2 id="the-options">The 2026 options</ArticleH2>
      <p>
        The four serious options for type-safe Postgres access in TypeScript:
        Drizzle, Prisma, Kysely, sqlc. All four are mature; all four work.
        They differ in where the source of truth lives and how the agent
        reads it.
      </p>

      <ArticleH2 id="drizzle">Drizzle</ArticleH2>
      <p>
        Schema is a TypeScript file. Queries are SQL-shaped. Types are
        inferred without code generation.
      </p>
      <CodeBlock language="ts" filename="drizzle-example.ts">{`import { eq } from "drizzle-orm";
import { db } from "./db";
import { posts } from "./schema";

// Type of \`row\` is inferred from the schema.
const row = await db.select().from(posts).where(eq(posts.id, "abc")).limit(1);`}</CodeBlock>
      <p>
        <strong>Wins</strong>: zero codegen step; agent reads the schema
        file directly; close to SQL so Postgres-specific features work; tiny
        bundle.<br />
        <strong>Loses</strong>: no opinionated migration workflow (drizzle-kit
        is good but lighter than Prisma Migrate).
      </p>

      <ArticleH2 id="prisma">Prisma</ArticleH2>
      <p>
        Schema is a <code>.prisma</code> DSL. Run <code>prisma generate</code>{" "}
        to produce a typed client. Queries use a higher-level API
        (<code>findMany</code>, <code>create</code>).
      </p>
      <CodeBlock language="ts" filename="prisma-example.ts">{`const row = await prisma.post.findUnique({
  where: { id: "abc" },
  select: { id: true, title: true, status: true },
});
// row is typed: { id: string; title: string; status: PostStatus } | null`}</CodeBlock>
      <p>
        <strong>Wins</strong>: very ergonomic; mature migration workflow;
        cross-database (Mongo too).<br />
        <strong>Loses</strong>: <code>.prisma</code> DSL is a second
        language; runtime engine adds bundle weight on the edge; less
        Postgres-specific power.
      </p>

      <ArticleH2 id="kysely">Kysely</ArticleH2>
      <p>
        A query builder with type-inference from a hand-written types file.
        Closer to SQL than Drizzle&apos;s API; less magic.
      </p>
      <p>
        <strong>Wins</strong>: fantastic types; great for projects that
        prefer raw query shape; works well with any Postgres driver.<br />
        <strong>Loses</strong>: types file is hand-written or generated
        (kysely-codegen); one more thing to keep in sync.
      </p>

      <ArticleH2 id="sqlc">sqlc</ArticleH2>
      <p>
        You write SQL files; sqlc generates typed TypeScript (or Go, Python,
        etc.) functions. Source of truth is SQL itself.
      </p>
      <p>
        <strong>Wins</strong>: SQL-as-source-of-truth is great for teams that
        already speak SQL fluently; agents love SQL.<br />
        <strong>Loses</strong>: TypeScript support is newer than the Go
        equivalent; ecosystem smaller than Drizzle / Prisma.
      </p>

      <ArticleH2 id="verdict">Verdict</ArticleH2>
      <p>
        For new TypeScript + Postgres projects in 2026 where the AI is the
        primary author: <strong>Drizzle</strong>. The schema-as-TS pattern
        is the most agent-friendly we&apos;ve worked with, and the
        zero-codegen story removes a whole class of "types are stale"
        bugs.
      </p>
      <p>
        For teams with a Prisma-shaped culture and a value on the higher-
        level API: <strong>Prisma</strong>. Both work fine; the difference is
        ergonomic preference more than capability.
      </p>
      <p>
        For SQL-first cultures: <strong>sqlc</strong>. Less common in
        the AI-paired world but very legible.
      </p>

      <Callout variant="tip" title="Whichever you pick, commit the types">
        Generated types belong in git. Not <code>.gitignore</code>. Not
        &quot;regenerated on CI&quot;. The agent reads the types in the
        repo; if they&apos;re missing, the agent invents them.
      </Callout>

      <p>
        See <Link href="/compare/drizzle-vs-prisma">our Drizzle vs Prisma
        comparison</Link> for the full head-to-head if you&apos;re picking
        between those two specifically.
      </p>
    </>
  );
}
