import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "vibe-coding-database-patterns",
  title: "Vibe-Coding with a Database: 10 Patterns That Don't Break",
  description:
    "Ten concrete patterns for keeping AI-paired database work clean: typed schemas, migration discipline, RLS-as-authz, write-confirmation gates, and the anti-patterns to avoid.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 13,
  tags: ["vibe-coding", "patterns", "databases", "ai"],
  related: ["best-ai-friendly-database-2026", "ai-assisted-database-admin", "which-database-for-vibe-coding-2026"],
  toc: [
    { id: "what-keeps-breaking", label: "What keeps breaking" },
    { id: "patterns", label: "The 10 patterns" },
    { id: "anti-patterns", label: "Anti-patterns" },
    { id: "starter-prompt", label: "A starter prompt" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        We&apos;ve audited dozens of AI-paired codebases in the last 18
        months. The ones that ship clean and the ones that bog down look
        almost identical in week one. The difference is a small set of
        patterns the clean ones used from the start.
      </p>

      <p>
        Here are the ten that matter most when you&apos;re building with
        an AI doing most of the database typing.
      </p>

      <ArticleH2 id="what-keeps-breaking">What keeps breaking</ArticleH2>

      <p>The recurring failure modes in vibe-coded database work:</p>

      <ul>
        <li>
          The schema in your repo drifts from production because the
          agent ran ad-hoc ALTER TABLE.
        </li>
        <li>
          The agent invents column names; the next ten PRs carry the bug.
        </li>
        <li>
          The agent disables RLS &quot;to test&quot; and forgets to put
          it back.
        </li>
        <li>
          A write goes through with no record because the agent didn&apos;t
          know about your audit-logging convention.
        </li>
        <li>
          The agent silently uses an ORM&apos;s &quot;skip type
          checking&quot; escape hatch.
        </li>
      </ul>

      <p>Each one has a concrete pattern that prevents it.</p>

      <ArticleH2 id="patterns">The 10 patterns</ArticleH2>

      <h3>1. Generated types, committed to git</h3>

      <p>
        Whichever ORM you use (Drizzle, Prisma, sqlc), the type-generation
        step should run on every schema change and the output should be
        committed. Not in <code>.gitignore</code>. The agent reads those
        types every turn.
      </p>

      <CodeBlock language="ts" filename="schema.ts">{`// Drizzle example. The agent sees this exact shape every turn.
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  authorId:   uuid("author_id").notNull(),
  title:      text("title").notNull(),
  content:    text("content"),
  status:     text("status").$type<"draft" | "published">().notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});`}</CodeBlock>

      <h3>2. One migration file per change, always</h3>

      <p>
        Tell the agent in your project README: &quot;every schema change
        is a migration in <code>drizzle/</code>. Never modify production
        directly.&quot; Most agents will follow this when it&apos;s in the
        repo&apos;s top-level docs.
      </p>

      <h3>3. A schema snapshot test</h3>

      <p>
        A test that dumps the schema and compares it to a snapshot file.
        Any drift surfaces as a PR diff. Catches the &quot;agent edited
        production directly&quot; case before it ships.
      </p>

      <h3>4. RLS on day one, never off</h3>

      <p>
        Enable Row-Level Security on every user-facing table before you
        write the first row. The agent will respect it once it sees the
        first policy. (See{" "}
        <Link href="/blog/row-level-security-postgres-2026">our RLS guide</Link>
        for the policy patterns.)
      </p>

      <h3>5. Never let the agent write directly with service_role</h3>

      <p>
        The agent&apos;s default Supabase key in dev should be the anon
        key. Make &quot;use service_role&quot; an explicit, audited step
        in your code. Bugs that bypass RLS through service_role are the
        single most expensive incident class.
      </p>

      <h3>6. Wrap writes in a single audited path</h3>

      <p>
        Every INSERT/UPDATE/DELETE in your app goes through one helper
        that writes an audit log entry. The agent finds that helper
        quickly and uses it for new mutations.
      </p>

      <CodeBlock language="ts" filename="audited-write.ts">{`export async function recordAndApply<T>(
  user: User,
  args: { action: "insert" | "update" | "delete"; table: string; pk?: string },
  apply: () => Promise<T>,
): Promise<T> {
  const result = await apply();
  await db.insert(auditLog).values({
    userId: user.id,
    action: args.action,
    table:  args.table,
    pk:     args.pk,
    at:     new Date(),
  });
  return result;
}`}</CodeBlock>

      <h3>7. Confirm-before-execute for AI-proposed writes</h3>

      <p>
        If you use an AI assistant inside your admin tool, the agent
        should never write directly. It proposes; the human confirms in
        the UI; the server re-validates and writes. The pattern is
        documented in{" "}
        <Link href="/blog/ai-assisted-database-admin">our AI admin
        article</Link> and shipped in{" "}
        <Link href="/features">our chat assistant</Link>.
      </p>

      <h3>8. Type-narrow your enums</h3>

      <p>
        Postgres has check constraints; SQLite has check constraints; both
        also let your ORM declare an enum type. Use both. The DB enforces
        valid values; the type system tells the agent which values exist.
      </p>

      <h3>9. Make &quot;run the migrations&quot; one command</h3>

      <p>
        <code>pnpm db:migrate</code> or equivalent. The agent will run it
        before every test cycle. Local dev environments that are one
        command away from production parity are vastly more agent-friendly.
      </p>

      <h3>10. Snapshot your schema diagrams in the repo</h3>

      <p>
        A short markdown file with an ASCII or mermaid diagram showing
        your main entities and their relationships. The agent reads it
        when it starts working on a new feature; you avoid the
        &quot;every feature ignores the relationships&quot; failure mode.
      </p>

      <Callout variant="tip" title="What ties them together">
        Notice the pattern: every item above is something the agent can
        <em> read</em> in the repo. The agent doesn&apos;t need fancy
        retrieval; it needs a project that documents its own conventions
        in code or markdown next to the code.
      </Callout>

      <ArticleH2 id="anti-patterns">Anti-patterns</ArticleH2>

      <p>Things to actively avoid:</p>

      <ul>
        <li>
          <strong>&quot;Just let the agent run SQL&quot;</strong> as a
          development workflow. Agents in 2026 hallucinate confident SQL.
          Type-checked queries through an ORM catch this; raw SQL
          doesn&apos;t.
        </li>
        <li>
          <strong>Custom DSLs the agent doesn&apos;t know.</strong> If you
          invent a query helper the public corpus has never seen, the
          agent will misuse it on the third PR.
        </li>
        <li>
          <strong>Multi-step migrations performed in a single deploy.</strong>{" "}
          The agent will try to combine the &quot;add column&quot; +
          &quot;backfill&quot; + &quot;add NOT NULL&quot; steps that{" "}
          <Link href="/blog/zero-downtime-migrations">should be three
          separate deploys</Link>. Spell that constraint out in your repo.
        </li>
        <li>
          <strong>Trusting the agent to write tests.</strong> Especially
          negative-path tests (&quot;the user can&apos;t read someone
          else&apos;s row&quot;). Agents tend to write the happy path
          and skip the negative. Specify them.
        </li>
        <li>
          <strong>Live dashboards as the source of schema truth.</strong>{" "}
          The schema lives in code. The dashboard reflects it. If anyone
          (human or agent) edits the dashboard&apos;s schema directly,
          you&apos;ll find out at the worst possible time.
        </li>
      </ul>

      <ArticleH2 id="starter-prompt">A starter prompt</ArticleH2>

      <p>
        For new vibe-coded projects, drop this into your project README or
        agent rules file:
      </p>

      <CodeBlock filename=".cursorrules / AGENTS.md">{`When working on database code:

1. Every schema change is a migration file in \`drizzle/\`. Never
   ALTER TABLE in production. Run \`pnpm db:migrate\` after every
   migration is added.

2. Read \`src/db/schema.ts\` before writing any query. Use the types
   from \`drizzle-orm\` and the inferred row types. Do not invent
   column names.

3. Row-Level Security stays on. Every new table needs a policy in
   the migration that creates the table.

4. Every INSERT / UPDATE / DELETE goes through \`recordAndApply\`
   in \`src/lib/audit.ts\`. The audit log is non-negotiable.

5. When in doubt, use \`@/db/types\`. If a value's type is \`string\`
   but should be a tagged union, fix the schema, not the type cast.`}</CodeBlock>

      <p>
        Agents in 2026 follow rule files quite consistently. The five
        rules above prevent ~80% of the vibe-coded database bugs we&apos;ve
        seen in customer codebases. None of them are exotic; they&apos;re
        the discipline that good Postgres teams have always used. The AI
        just makes them more important.
      </p>

      <p>
        The shortest version: write down what your project assumes, in
        the repo, in plain English. The agent reads it. The next
        engineer reads it. Your future self reads it. Software gets
        better in the order it&apos;s written down.
      </p>
    </>
  );
}
