import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "cursor-plus-supabase-2026",
  title: "The Cursor + Supabase Stack in 2026",
  description:
    "End-to-end setup for the AI-paired stack that ships the fastest in 2026: Cursor for the editor, Supabase for the database, Drizzle for types, MCP servers for schema access.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["cursor", "supabase", "vibe-coding"],
  related: ["why-supabase-for-ai-agents", "type-safe-database-for-ai-paired-code", "vibe-coding-database-patterns"],
  toc: [
    { id: "the-stack", label: "The stack" },
    { id: "drizzle-schema", label: "Drizzle schema as source of truth" },
    { id: "rules-file", label: "Cursor rules file" },
    { id: "mcp", label: "MCP servers for live schema" },
    { id: "patterns", label: "Patterns that work" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        The Cursor + Supabase + Drizzle stack has converged in 2026 as the
        fastest way to ship CRUD apps with an AI in the loop. Three reasons:
        every layer is type-checked end-to-end, the database is introspectable,
        and the agent can read everything it needs in the repo.
      </p>

      <ArticleH2 id="the-stack">The stack</ArticleH2>
      <ul>
        <li><strong>Cursor</strong>: the editor. Rules file lives in the repo; the agent reads it.</li>
        <li><strong>Next.js 15</strong>: app router; server actions handle most write paths.</li>
        <li><strong>Supabase</strong>: Postgres, auth, storage, realtime. RLS is your authz layer.</li>
        <li><strong>Drizzle</strong>: schema-as-TypeScript + migrations.</li>
        <li><strong>Optional: an admin tool</strong> like <Link href="/">Suparbase</Link> for ops work.</li>
      </ul>

      <ArticleH2 id="drizzle-schema">Drizzle schema as the source of truth</ArticleH2>
      <p>
        Everything starts here. The schema file is what your agent reads every
        turn:
      </p>
      <CodeBlock language="ts" filename="src/db/schema.ts">{`import {
  pgTable, uuid, text, timestamp, boolean, index,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    tenantId:   uuid("tenant_id").notNull(),
    name:       text("name").notNull(),
    slug:       text("slug").notNull(),
    archived:   boolean("archived").notNull().default(false),
    createdAt:  timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx:  index("projects_tenant_idx").on(t.tenantId),
    slugIdx:    index("projects_slug_idx").on(t.tenantId, t.slug),
  }),
);

export type Project        = typeof projects.$inferSelect;
export type ProjectInsert  = typeof projects.$inferInsert;`}</CodeBlock>

      <ArticleH2 id="rules-file">Cursor rules file</ArticleH2>
      <p>
        The rules file (<code>.cursorrules</code> or <code>AGENTS.md</code>)
        is where you put the conventions the agent should follow. Every
        team&apos;s version is different; ours is roughly:
      </p>
      <CodeBlock filename=".cursorrules">{`When working in this repo:

- Schema changes: edit src/db/schema.ts, then run
  \`pnpm drizzle-kit generate && pnpm drizzle-kit migrate\`.
  Never ALTER TABLE in production directly.

- Reads use the typed Drizzle query builder, not raw SQL.

- Writes go through src/lib/audit.ts:recordAndApply so every
  change ends up in audit_log.

- RLS stays on. Every new table needs policies in the same migration.
  Default to: USING (tenant_id IN (SELECT public.my_tenants())).

- For Supabase admin operations that need service_role, use
  src/lib/sb-admin.ts. Add a code comment naming the reason.

- For new server actions, default to "use server"; return typed errors
  using neverthrow's Result type.`}</CodeBlock>

      <ArticleH2 id="mcp">MCP servers for live schema</ArticleH2>
      <p>
        Cursor (and Claude Code, Windsurf, etc.) speak the Model Context
        Protocol. The Supabase team ships an MCP server that gives the agent
        live access to your schema introspection. With it, the agent can:
      </p>
      <ul>
        <li>List tables and columns on the running project, not just the repo.</li>
        <li>Read RLS policies as they exist in production.</li>
        <li>Run an EXPLAIN on a generated query to verify the plan.</li>
        <li>Suggest indexes based on real slow queries.</li>
      </ul>
      <p>
        Setup is a single block in <code>.cursor/mcp.json</code>:
      </p>
      <CodeBlock language="json" filename=".cursor/mcp.json">{`{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server", "--read-only"]
    }
  }
}`}</CodeBlock>

      <Callout variant="tip" title="--read-only by default">
        Run the MCP server in read-only mode. The agent can introspect and
        plan; it can&apos;t accidentally <code>DROP TABLE</code> through the
        MCP channel. For writes, use server actions + the audit log.
      </Callout>

      <ArticleH2 id="patterns">Patterns that work</ArticleH2>

      <h3>1. Type the input + output of every server action</h3>
      <p>
        Zod schemas at the input boundary; inferred return type from
        Drizzle. The agent reads both and writes correct callers.
      </p>

      <h3>2. Co-locate UI + server action + schema for a feature</h3>
      <p>
        <code>app/projects/page.tsx</code>, <code>app/projects/actions.ts</code>,{" "}
        <code>app/projects/schema.ts</code>. The agent looks for the trio when
        adding a related feature.
      </p>

      <h3>3. Test the negative path</h3>
      <p>
        The agent will write the happy-path test. You ask it explicitly for
        the negative-path tests: &quot;write a test that a non-member cannot
        read a project they don&apos;t belong to.&quot;
      </p>

      <h3>4. Use an admin tool for the data, not the agent</h3>
      <p>
        Don&apos;t ask the agent to &quot;go check the staging database for
        bad rows&quot;. Open{" "}
        <Link href="/features">the admin</Link>, use Cmd-K, find the row,
        fix it. The agent is for code; the admin is for ops.
      </p>

      <p>
        The stack is boring on purpose. Each piece does one thing. Nothing
        is exotic. The result is a development loop where you describe a
        feature in plain English and the agent ships a typed, RLS-protected,
        audit-logged implementation in minutes.
      </p>
    </>
  );
}
