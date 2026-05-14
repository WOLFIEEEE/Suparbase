import { ArticleH2, CodeBlock, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "setup-supabase-with-cursor",
  title: "Set Up Supabase with Cursor in 5 Minutes",
  description:
    "An opinionated quickstart: Supabase project, Drizzle for type-safe queries, Cursor rules file, your first table. The same template we use to start every new vibe-coded project in 2026.",
  level: "Beginner" as const,
  readingMinutes: 8,
  timeMinutes: 5,
  tags: ["supabase", "cursor", "drizzle", "quickstart"],
  steps: [
    { id: "step-1", title: "Create the Supabase project" },
    { id: "step-2", title: "Bootstrap a Next.js app with Drizzle" },
    { id: "step-3", title: "Wire up the Supabase connection" },
    { id: "step-4", title: "Define your first schema" },
    { id: "step-5", title: "Add a Cursor rules file" },
    { id: "step-6", title: "Ship the first feature" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        This is the opinionated setup we use to start every new vibe-coded
        project. Five minutes of work; the rest of the project is downstream.
      </p>

      <ArticleH2 id="step-1">Step 1: Create the Supabase project</ArticleH2>
      <p>
        Head to <a href="https://supabase.com/dashboard">supabase.com/dashboard</a>,
        create a new project. Pick the closest region. Save the database
        password somewhere safe.
      </p>
      <p>From the project settings, grab:</p>
      <ul>
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
        <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
        <li>The direct connection string (Settings → Database → Connection string).</li>
      </ul>

      <ArticleH2 id="step-2">Step 2: Bootstrap a Next.js app with Drizzle</ArticleH2>
      <CodeBlock language="bash" filename="terminal">{`pnpm create next-app@latest my-app --typescript --app --tailwind
cd my-app

# Drizzle + postgres-js + Zod
pnpm add drizzle-orm postgres zod
pnpm add -D drizzle-kit @types/pg`}</CodeBlock>
      <p>
        Add <code>drizzle.config.ts</code> at the root:
      </p>
      <CodeBlock language="ts" filename="drizzle.config.ts">{`import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;`}</CodeBlock>

      <ArticleH2 id="step-3">Step 3: Wire up the Supabase connection</ArticleH2>
      <CodeBlock language="ts" filename="src/db/client.ts">{`import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,           // serverless-friendly
  prepare: false,   // safe for transaction-mode pooling
});

export const db = drizzle(sql);`}</CodeBlock>
      <p>
        Add <code>.env.local</code>:
      </p>
      <CodeBlock filename=".env.local">{`DATABASE_URL=postgres://postgres:[password]@db.[project].supabase.co:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...`}</CodeBlock>
      <Callout variant="tip" title="Port 6543, not 5432">
        Port 6543 is Supabase&apos;s Supavisor transaction-mode pooler. It&apos;s
        what you want for serverless deploys (Vercel, Cloudflare Workers,
        edge functions).
      </Callout>

      <ArticleH2 id="step-4">Step 4: Define your first schema</ArticleH2>
      <CodeBlock language="ts" filename="src/db/schema.ts">{`import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id:        uuid("id").primaryKey().defaultRandom(),
  authorId:  uuid("author_id").notNull(),
  title:     text("title").notNull(),
  content:   text("content"),
  status:    text("status").$type<"draft" | "published">().notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});`}</CodeBlock>
      <p>Generate and apply the migration:</p>
      <CodeBlock language="bash" filename="terminal">{`pnpm drizzle-kit generate
pnpm drizzle-kit migrate`}</CodeBlock>

      <ArticleH2 id="step-5">Step 5: Add a Cursor rules file</ArticleH2>
      <p>
        Drop <code>.cursorrules</code> (or <code>AGENTS.md</code> if you prefer
        the open standard) at the repo root:
      </p>
      <CodeBlock filename=".cursorrules">{`When working on database code:

1. Every schema change is a migration in \`drizzle/\`. Run
   \`pnpm drizzle-kit generate\` after every \`src/db/schema.ts\`
   change, then \`pnpm drizzle-kit migrate\`. Never ALTER TABLE
   in production directly.

2. Read \`src/db/schema.ts\` before writing any query. Use the
   types from \`drizzle-orm\` and the inferred row types. Do not
   invent column names.

3. Row-Level Security stays on. Every new table needs a policy in
   the migration that creates the table.

4. Default to the anon Supabase client. Use service_role only with
   an explicit comment explaining why.`}</CodeBlock>

      <ArticleH2 id="step-6">Step 6: Ship the first feature</ArticleH2>
      <p>
        Open Cursor and ask: <em>&quot;create a route at /api/posts that
        lists the 10 most recent published posts&quot;</em>. The agent reads
        your schema, generates a typed query, returns the route. You ship.
      </p>
      <Callout variant="sparkle" title="That's the loop">
        Schema in code. Migrations in code. Agent reads both. Five minutes
        from blank canvas to first feature. Repeat for the rest of your
        project.
      </Callout>
    </>
  );
}
