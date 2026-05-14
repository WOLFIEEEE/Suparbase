import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "add-rls-to-existing-database",
  title: "Add RLS to an Existing Postgres Database Without Breaking Production",
  description:
    "A step-by-step playbook for enabling Row-Level Security on a Postgres database that's already in production. With rollback strategy, testing patterns, and the gotchas.",
  level: "Intermediate" as const,
  readingMinutes: 11,
  timeMinutes: 30,
  tags: ["postgres", "rls", "supabase", "security"],
  steps: [
    { id: "pre-flight", title: "Pre-flight: audit your queries" },
    { id: "step-1", title: "Pick a target table" },
    { id: "step-2", title: "Write the policies first" },
    { id: "step-3", title: "Test in a transaction" },
    { id: "step-4", title: "Enable RLS in a single migration" },
    { id: "step-5", title: "Verify production traffic" },
    { id: "rollback", title: "Rollback plan" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        Turning on RLS for a table that&apos;s already serving production
        traffic is one of those changes that&apos;s scary because the failure
        mode is &quot;nobody can see their data&quot;. The fix isn&apos;t to
        do it carefully on Friday afternoon. The fix is a playbook.
      </p>

      <ArticleH2 id="pre-flight">Pre-flight: audit your queries</ArticleH2>
      <p>
        Before you turn RLS on for any table, you need to know every query
        that hits it. Run this:
      </p>
      <CodeBlock language="sql" filename="audit.sql">{`-- All current activity touching the target table.
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%public.posts%'
ORDER BY calls DESC
LIMIT 20;`}</CodeBlock>
      <p>
        Look at the role each call uses. If anything is hitting the table
        as <code>service_role</code>, RLS won&apos;t affect it (good or bad).
        If your app uses <code>authenticated</code> or <code>anon</code>, RLS
        will start filtering on those queries.
      </p>

      <ArticleH2 id="step-1">Step 1: Pick a target table</ArticleH2>
      <p>
        Start with one table. Don&apos;t batch &quot;enable RLS on
        everything&quot; into one PR; you want clean rollback.
      </p>

      <ArticleH2 id="step-2">Step 2: Write the policies first</ArticleH2>
      <p>
        Write the policies you intend to use, but <em>don&apos;t enable RLS
        yet</em>. The policies sit in the schema unused until RLS is on.
      </p>
      <CodeBlock language="sql" filename="policies.sql">{`-- Read: anyone authenticated sees their own posts.
CREATE POLICY "Author reads their posts"
  ON public.posts FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- Write: same constraint.
CREATE POLICY "Author writes their posts"
  ON public.posts FOR ALL TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);`}</CodeBlock>

      <ArticleH2 id="step-3">Step 3: Test in a transaction</ArticleH2>
      <p>
        Postgres lets you temporarily enable RLS on a table inside a
        transaction. Run your most common queries with simulated JWT claims;
        roll back when you&apos;re done.
      </p>
      <CodeBlock language="sql" filename="rls-test.sql">{`BEGIN;
-- Pretend to be the user whose data you're inspecting.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"<real-user-uuid>","role":"authenticated"}',
  true
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Run the queries your application makes. They should still work
-- for the simulated user.
SELECT id, title FROM posts LIMIT 5;

-- Now simulate a DIFFERENT user. They should see only their rows.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"<other-user-uuid>","role":"authenticated"}',
  true
);
SELECT id, title FROM posts LIMIT 5;

ROLLBACK;`}</CodeBlock>
      <Callout variant="tip" title="Use a real simulator">
        Our <Link href="/features">RLS debugger</Link> runs this exact pattern
        through a web UI with role + claims pickers. If you&apos;re going to
        run this 10 times for 10 tables, save yourself the typing.
      </Callout>

      <ArticleH2 id="step-4">Step 4: Enable RLS in a single migration</ArticleH2>
      <p>
        Once the simulator says all your application queries work, the
        production migration is one line:
      </p>
      <CodeBlock language="sql" filename="migrations/0042_enable_rls_posts.sql">{`ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
-- The policies you wrote earlier are now active.`}</CodeBlock>
      <p>Deploy. Monitor your error log for &quot;permission denied&quot;.</p>

      <ArticleH2 id="step-5">Step 5: Verify production traffic</ArticleH2>
      <p>
        For the first hour after deploy, watch <code>pg_stat_statements</code>
        for new errors and check your app&apos;s error monitoring (Sentry, Logflare,
        whatever you use). If something denies, you&apos;ll see it within minutes.
      </p>

      <ArticleH2 id="rollback">Rollback plan</ArticleH2>
      <p>
        Rollback is one statement:
      </p>
      <CodeBlock language="sql" filename="rollback.sql">{`ALTER TABLE public.posts DISABLE ROW LEVEL SECURITY;`}</CodeBlock>
      <p>
        It&apos;s instant, doesn&apos;t require dropping policies, and reverts
        the table to wide-open. Have this prepared in your migration tool
        before you deploy step 4.
      </p>

      <Callout variant="sparkle" title="The pattern, condensed">
        Write policies → test in a transaction → enable RLS in production
        → monitor for an hour → repeat for the next table. The hard part is
        the testing, not the enabling.
      </Callout>
    </>
  );
}
