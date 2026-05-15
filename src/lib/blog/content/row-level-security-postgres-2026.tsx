import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "row-level-security-postgres-2026",
  title: "Row-Level Security in Postgres: A Practical Guide for 2026",
  description:
    "How to design, debug, and ship Postgres Row-Level Security policies in 2026. Covers Supabase patterns, JWT claims, policy testing, and the bugs that bite teams in production.",
  publishedAt: "2026-04-08",
  updatedAt: "2026-05-14",
  readingMinutes: 14,
  tags: ["postgres", "rls", "supabase", "security"],
  related: ["multi-tenant-saas-postgres", "supabase-vs-self-hosted-postgres", "ai-assisted-database-admin"],
  toc: [
    { id: "what-rls-actually-is", label: "What RLS actually is" },
    { id: "the-claim-pattern", label: "The claim-based pattern" },
    { id: "policies-by-verb", label: "One policy per verb, almost always" },
    { id: "the-three-bugs", label: "The three bugs every team ships" },
    { id: "testing-rls", label: "Testing RLS in CI" },
    { id: "performance", label: "Performance: when RLS gets slow" },
    { id: "debugging", label: "Debugging RLS in production" },
    { id: "ship-list", label: "Pre-ship checklist" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Row-Level Security has been in Postgres since 9.5 (late 2015), but the
        way teams actually use it has changed dramatically in the last three
        years. Supabase, Neon, and most JWT-based stacks now treat RLS as the
        primary authorization boundary: the database itself decides whether a
        given user can see a given row.
      </p>

      <p>
        That is, when it works. RLS is also where the most production-impacting
        bugs hide. This guide is what we&apos;ve learned from operating it
        across dozens of Supabase projects in 2025 and 2026.
      </p>

      <ArticleH2 id="what-rls-actually-is">What RLS actually is</ArticleH2>

      <p>
        Row-Level Security is a per-table feature that lets you attach{" "}
        <em>policies</em> to a relation. A policy is an SQL expression that
        returns boolean for each row, evaluated automatically on every
        SELECT/INSERT/UPDATE/DELETE that touches the table.
      </p>

      <p>RLS has two switches you have to flip explicitly per table:</p>

      <CodeBlock language="sql" filename="enable-rls.sql">{`-- 1. Turn the feature on.
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 2. (Optional but recommended) make it apply to table owners too.
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;

-- 3. Add policies. WITHOUT a policy, RLS denies everything by default.
CREATE POLICY "Authors read their own posts"
  ON public.posts FOR SELECT
  USING (auth.uid() = author_id);`}</CodeBlock>

      <Callout variant="watch-out" title="The default-deny gotcha">
        Enabling RLS without any policies locks your table down completely.
        That&apos;s technically correct behaviour, but it means a forgotten{" "}
        <code>CREATE POLICY</code> in a migration will look like a runtime
        outage. Always pair <code>ENABLE</code> with at least one explicit
        policy in the same migration.
      </Callout>

      <ArticleH2 id="the-claim-pattern">The claim-based pattern</ArticleH2>

      <p>
        In a Supabase or Neon-style stack, the database sees an authenticated
        request as a JWT signed by your auth service. PostgREST (or
        pg_jwt-aware Postgres) decodes the JWT and sets two GUCs at the
        statement level:
      </p>

      <ul>
        <li>
          <code>request.jwt.claim.role</code>, the JWT&apos;s role claim, e.g.{" "}
          <code>authenticated</code>.
        </li>
        <li>
          <code>request.jwt.claims</code>, the full claims object as a JSON
          string.
        </li>
      </ul>

      <p>
        Supabase exposes the helper <code>auth.uid()</code> which reads{" "}
        <code>request.jwt.claims-{">"}sub</code> and returns it as a uuid. This
        gives you a clean primitive:
      </p>

      <CodeBlock language="sql" filename="ownership-policy.sql">{`CREATE POLICY "Authors manage their own posts"
  ON public.posts FOR ALL TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);`}</CodeBlock>

      <p>
        Two things to notice. First, <code>TO authenticated</code> scopes the
        policy to the <em>Postgres role</em> the request is using; anon
        requests will still get denied. Second, <code>WITH CHECK</code> matters
        for writes, without it, an authenticated user could create rows with
        a <code>author_id</code> that isn&apos;t theirs.
      </p>

      <ArticleH2 id="policies-by-verb">One policy per verb, almost always</ArticleH2>

      <p>
        New teams reach for <code>FOR ALL</code> because it&apos;s tidy. In
        practice, splitting policies by verb (SELECT / INSERT / UPDATE /
        DELETE) almost always pays off:
      </p>

      <ul>
        <li>
          Read policies and write policies tend to diverge over time. A user
          can usually <em>see</em> more rows than they can edit.
        </li>
        <li>
          Verb-specific policies are easier to grep for, easier to test, and
          easier for the RLS debugger in tools like{" "}
          <Link href="/features">Suparbase</Link> to surface meaningfully.
        </li>
        <li>
          DELETE policies are often where bugs live (a soft-delete flag in
          UPDATE that should also have been blocked by DELETE).
        </li>
      </ul>

      <CodeBlock language="sql" filename="split-policies.sql">{`-- Read: authors and reviewers can see drafts; everyone can see published.
CREATE POLICY "Public read of published posts"
  ON public.posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Author read of their drafts"
  ON public.posts FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- Write: only the author can insert/update; nobody deletes through the API.
CREATE POLICY "Author writes their own"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Author updates their own draft"
  ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid() = author_id AND status = 'draft')
  WITH CHECK (auth.uid() = author_id);

-- (intentionally no DELETE policy: archive instead.)
`}</CodeBlock>

      <ArticleH2 id="the-three-bugs">The three bugs every team ships</ArticleH2>

      <p>
        We&apos;ve audited dozens of production Supabase projects. Three
        classes of RLS bug account for most of the incidents we&apos;ve seen.
      </p>

      <h3>1. The missing <code>WITH CHECK</code></h3>

      <p>
        <code>USING</code> filters which rows the user can <em>see</em>;{" "}
        <code>WITH CHECK</code> filters what they can <em>write</em>. A policy
        with only <code>USING</code> on a write operation lets the user change
        any column to any value as long as they could see the row at all. The
        canonical incident: a user can read a public profile, then update its{" "}
        <code>email</code> column because nothing checks who they are.
      </p>

      <h3>2. The wrong role binding</h3>

      <p>
        A policy without <code>TO &lt;role&gt;</code> applies to{" "}
        <em>everyone, including anon</em>. The fix is mechanical (always scope
        write policies to <code>authenticated</code>) but is easy to forget
        when you copy a SELECT policy and forget to add the role.
      </p>

      <h3>3. The implicit join across tables</h3>

      <p>
        Policies that join through related tables look right and feel right -
        until a malicious user constructs a query that brings the related row
        in via a different path. The mitigation: when your policy references
        another table, that table also needs an RLS policy that the same user
        can pass.
      </p>

      <Callout variant="tip" title="A useful rule of thumb">
        Every policy you write should be reviewable on a single slide. If your
        policy expression has more than two function calls and one join,
        you&apos;re probably one bug away from a leak. Move the logic into a{" "}
        <code>SECURITY DEFINER</code> function with strict argument validation
        and call it from the policy.
      </Callout>

      <ArticleH2 id="testing-rls">Testing RLS in CI</ArticleH2>

      <p>
        The reason RLS bugs ship is that teams test the happy path manually and
        ignore the negative cases. The pattern that actually works is to write
        focused integration tests that:
      </p>

      <ol>
        <li>Open a transaction.</li>
        <li>
          Use <code>set_config</code> to set <code>request.jwt.claims</code>{" "}
          and <code>role</code> to the user you&apos;re simulating.
        </li>
        <li>Run the query you expect to allow OR deny.</li>
        <li>Roll back so no test data sticks around.</li>
      </ol>

      <CodeBlock language="sql" filename="rls-test.sql">{`BEGIN;

-- Pretend to be user X with the authenticated role.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

-- Negative test: user X cannot see user Y's draft.
SELECT 1
FROM posts
WHERE id = 'the-other-user-draft-id'
  AND status = 'draft';
-- Expect: zero rows.

-- Negative test: user X cannot update someone else's post.
UPDATE posts
SET title = 'pwned'
WHERE author_id <> auth.uid();
-- Expect: zero rows updated.

ROLLBACK;`}</CodeBlock>

      <p>
        This is exactly what Suparbase&apos;s{" "}
        <Link href="/features">RLS debugger</Link> automates: pick a table,
        pick a role, paste a claims object, and the simulator runs each verb
        inside a rolled-back transaction and reports allow/deny with the
        visible row count. The same pattern in CI catches regressions before
        you ship.
      </p>

      <ArticleH2 id="performance">Performance: when RLS gets slow</ArticleH2>

      <p>
        RLS adds a predicate to every query plan. For ownership checks like{" "}
        <code>auth.uid() = author_id</code>, this is essentially free, the
        planner pushes the predicate down and uses your existing index on{" "}
        <code>author_id</code>.
      </p>

      <p>The two slow patterns to watch for:</p>

      <ul>
        <li>
          <strong>Policies that call <code>auth.uid()</code> repeatedly</strong>{" "}
          in joins. Postgres can&apos;t always cache the result, and you end up
          calling the JWT decoder per row. Materialise it once into a CTE.
        </li>
        <li>
          <strong>Policies that join through three or more tables</strong> to
          decide visibility. The planner can&apos;t always push the join down,
          and you get a nested loop on every read. Denormalise the
          authorization-relevant key onto the row itself.
        </li>
      </ul>

      <CodeBlock language="sql" filename="denormalise.sql">{`-- Slow: every read on \`messages\` joins \`channels\` to check membership.
CREATE POLICY "Members read messages"
  ON messages FOR SELECT TO authenticated
  USING (
    channel_id IN (
      SELECT channel_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Faster: store the workspace_id on every message row, then index it.
ALTER TABLE messages ADD COLUMN workspace_id uuid;
CREATE INDEX messages_workspace_user_idx ON messages (workspace_id);

CREATE POLICY "Members read messages"
  ON messages FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );`}</CodeBlock>

      <ArticleH2 id="debugging">Debugging RLS in production</ArticleH2>

      <p>
        When a customer says &quot;I can&apos;t see my data&quot;, the worst
        debug path is reading the policy SQL with your eyes. The fast path:
      </p>

      <ol>
        <li>
          Reproduce the user&apos;s context. Get their JWT claims (sub, role,
          and any custom claims your auth function reads).
        </li>
        <li>
          Open a transaction, set those claims, run the query, ROLLBACK.
        </li>
        <li>
          If it fails, run the query again with <code>EXPLAIN</code> to see
          which policy filtered the row out.
        </li>
      </ol>

      <p>
        A few minutes inside a simulator beats half an hour grepping policy
        files. Both PG&apos;s native tools and Supabase Studio give you the
        building blocks; what they don&apos;t give you is the friendly &quot;run
        every verb at once and tell me which one denied&quot; view. That&apos;s
        what we built our debugger around.
      </p>

      <ArticleH2 id="ship-list">Pre-ship checklist</ArticleH2>

      <p>Before merging a table-touching PR:</p>

      <ul>
        <li>RLS is enabled <strong>and</strong> at least one policy exists per verb you allow.</li>
        <li><code>WITH CHECK</code> is present on every INSERT / UPDATE policy.</li>
        <li>Every write policy is scoped <code>TO authenticated</code> (or stricter).</li>
        <li>If your policy references another table, that table also has policies you control.</li>
        <li>You ran the simulator for each role you support (anon / authenticated / service_role) and the verb matrix matches expectations.</li>
        <li>At least one negative test sits in CI so a future migration can&apos;t silently widen access.</li>
      </ul>

      <p>
        RLS rewards the team that treats it as production code, not as a
        configuration step. The good news is that with the right tooling and
        a discipline of always testing the deny path, it&apos;s one of the
        cleanest authorization stories Postgres has ever shipped.
      </p>
    </>
  );
}
