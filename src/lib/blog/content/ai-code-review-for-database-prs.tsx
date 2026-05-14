import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "ai-code-review-for-database-prs",
  title: "AI Code Review for Database PRs in 2026",
  description:
    "How to use an AI reviewer to catch the migration, RLS, and N+1 bugs your eyes miss. Practical patterns for AI-augmented code review on Postgres / Supabase PRs.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["ai", "code-review", "postgres", "ci"],
  related: ["vibe-coding-database-patterns", "ai-assisted-database-admin", "zero-downtime-migrations"],
  toc: [
    { id: "why-ai-review", label: "Why AI review the human review" },
    { id: "what-it-catches", label: "What AI reviewers catch reliably" },
    { id: "what-they-miss", label: "What they still miss" },
    { id: "the-setup", label: "A working setup" },
    { id: "checklist", label: "Database-specific checklist prompt" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Human code review still matters. So does the fact that humans don&apos;t
        always read carefully on a Friday afternoon. AI reviewers shipped on
        GitHub PRs in 2025 are the cheap second pair of eyes that catches the
        boring bugs &mdash; especially in database PRs, where boring bugs are
        usually the expensive ones.
      </p>

      <ArticleH2 id="why-ai-review">Why AI reviews the human review</ArticleH2>
      <p>
        AI reviewers are good at the exact thing humans are bad at: reading
        every line, checking every invariant, every time. They&apos;re not
        replacing the senior who looks at the PR for architectural sense.
        They&apos;re catching the migration that forgot{" "}
        <code>WITH CHECK</code>, the index that&apos;s redundant with another,
        the N+1 query the test suite never exercises.
      </p>

      <ArticleH2 id="what-it-catches">What AI reviewers catch reliably</ArticleH2>

      <h3>Migration safety issues</h3>
      <ul>
        <li><code>ALTER COLUMN ... TYPE</code> that will rewrite a hot table.</li>
        <li><code>NOT NULL</code> additions without a backfill or default.</li>
        <li>Index creation without <code>CONCURRENTLY</code>.</li>
        <li>Volatile defaults on new columns (<code>DEFAULT now()</code>, <code>gen_random_uuid()</code>).</li>
      </ul>

      <h3>RLS issues</h3>
      <ul>
        <li>New table without RLS enabled or without policies.</li>
        <li>Policies missing <code>WITH CHECK</code> on writes.</li>
        <li>Policies that forget the role binding (no <code>TO authenticated</code>).</li>
        <li>Functions in policies that aren&apos;t <code>SECURITY DEFINER</code> when they should be.</li>
      </ul>

      <h3>Query shape issues</h3>
      <ul>
        <li>N+1 queries inside loops.</li>
        <li>Missing indexes on FK columns when the new code joins through them.</li>
        <li>Queries that fetch <code>*</code> when only a few columns are used.</li>
      </ul>

      <ArticleH2 id="what-they-miss">What they still miss</ArticleH2>
      <p>
        Domain logic. Architectural choices. Whether a feature should exist.
        AI reviewers are very good at "this code is technically wrong" and
        very bad at "this code is in the wrong place". Use them for the
        former; keep humans for the latter.
      </p>

      <ArticleH2 id="the-setup">A working setup</ArticleH2>
      <p>
        The pattern that ships at most teams in 2026:
      </p>
      <ol>
        <li>GitHub PR triggers a GitHub Action.</li>
        <li>Action diffs the PR, builds a focused prompt with the changed migration files + the related table schemas + a project rules file.</li>
        <li>Hits the OpenRouter (or Anthropic, or OpenAI) API with a strict review prompt.</li>
        <li>Posts inline review comments via the GitHub REST API.</li>
        <li>Sets a check status: pass or "needs review".</li>
      </ol>
      <p>
        The whole setup is ~150 lines of TypeScript. Cost per PR is a few
        cents.
      </p>

      <CodeBlock language="yaml" filename=".github/workflows/db-review.yml">{`name: AI database review
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: |
          # Collect just the changed files under drizzle/ and src/db/
          git diff --name-only origin/main HEAD \\
            | grep -E '^(drizzle|src/db)/' > changed.txt
          if [ -s changed.txt ]; then
            pnpm tsx scripts/ai-review.ts < changed.txt
          fi`}</CodeBlock>

      <ArticleH2 id="checklist">Database-specific checklist prompt</ArticleH2>
      <p>
        Generic AI review prompts are okay; specific ones are great. We use
        this checklist for our own database PRs:
      </p>
      <CodeBlock filename="db-review-prompt.md">{`Review this PR for database safety issues only. Ignore style.

Check each of these and call out specific lines:

1. Migrations
   - Any ALTER TABLE that rewrites the table on a busy production table?
   - Adding NOT NULL without a backfill plan?
   - Creating an index without CONCURRENTLY?
   - Using a volatile default on a new column?

2. RLS
   - New table: is RLS enabled and at least one policy per intended verb?
   - Write policies: do they have WITH CHECK matching USING?
   - Are policies scoped TO authenticated (or stricter)?

3. Queries
   - Any N+1 patterns in the diff?
   - New JOIN through a column that doesn't have an index?
   - SELECT * where only a couple of columns are used?

4. Types
   - Generated types committed in this PR if the schema changed?

For each finding, post a comment with the file:line and what to do
instead. If none, post LGTM.`}</CodeBlock>

      <Callout variant="tip" title="The cost ceiling that matters">
        Set a per-PR token cap in your reviewer script. A pathological
        PR (someone reformats every file) can blow through your monthly
        AI budget in one run. We cap at 50k tokens per review.
      </Callout>

      <p>
        AI code review for database PRs is one of the highest-leverage AI
        integrations a team can ship. It catches the bugs that are most
        expensive to fix in production and least visible during a normal
        review. Worth the afternoon to set up.
      </p>

      <p>
        For the broader vibe-coding-era patterns, see our{" "}
        <Link href="/blog/vibe-coding-database-patterns">database patterns
        playbook</Link>.
      </p>
    </>
  );
}
