import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "multi-tenant-saas-postgres",
  title: "Building Multi-Tenant SaaS on Postgres: Schemas, RLS, and Pooling",
  description:
    "Three battle-tested patterns for multi-tenancy on Postgres (and Supabase) in 2026: shared table with tenant_id, schema-per-tenant, and database-per-tenant. With migration, RLS, and pooling trade-offs.",
  publishedAt: "2026-04-22",
  updatedAt: "2026-05-14",
  readingMinutes: 17,
  tags: ["postgres", "multi-tenant", "saas", "supabase"],
  related: ["row-level-security-postgres-2026", "postgres-connection-pooling-2026", "supabase-vs-self-hosted-postgres"],
  toc: [
    { id: "three-patterns", label: "The three patterns" },
    { id: "shared-table", label: "Pattern A: shared table + tenant_id" },
    { id: "schema-per-tenant", label: "Pattern B: schema per tenant" },
    { id: "database-per-tenant", label: "Pattern C: database per tenant" },
    { id: "how-to-choose", label: "How to choose" },
    { id: "rls-trapdoors", label: "RLS trapdoors specific to multi-tenant" },
    { id: "pooling-implications", label: "Pooling implications" },
    { id: "operating", label: "Operating each shape" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Multi-tenancy is the architectural decision that haunts B2B SaaS the
        longest. Get it wrong early and you&apos;re refactoring during your
        Series A. Get it right and you have a system that scales from one
        customer to ten thousand without a re-platform.
      </p>

      <p>
        There are three real patterns on Postgres. None of them is universally
        right. We&apos;ll cover the trade-offs, the RLS implications, and the
        operational realities of each, all with Supabase as the implicit
        platform because that&apos;s where most teams shipping in 2026 start.
      </p>

      <ArticleH2 id="three-patterns">The three patterns</ArticleH2>

      <ol>
        <li>
          <strong>Shared table + tenant_id column</strong>. Every row carries a{" "}
          <code>tenant_id</code>. RLS filters on it. One database, one schema,
          one set of tables.
        </li>
        <li>
          <strong>Schema per tenant</strong>. Each tenant gets a Postgres
          schema with identical table structure. The application sets{" "}
          <code>search_path</code> per request.
        </li>
        <li>
          <strong>Database per tenant</strong>. Each tenant gets their own
          Postgres database (or Neon / Supabase project). Connection routing
          per request.
        </li>
      </ol>

      <p>That&apos;s it. People will try to invent a fourth; usually it&apos;s a hybrid of two of the above.</p>

      <ArticleH2 id="shared-table">Pattern A: shared table + tenant_id</ArticleH2>

      <p>This is what 80% of teams should ship. The shape:</p>

      <CodeBlock language="sql" filename="shared-table.sql">{`-- Tenants live in their own table.
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Every business entity carries a tenant_id.
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX projects_tenant_idx ON projects (tenant_id);

-- Membership table to map users to tenants.
CREATE TABLE memberships (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  role       text NOT NULL DEFAULT 'member',
  PRIMARY KEY (tenant_id, user_id)
);

-- RLS that tells Postgres "this user can only see their tenant's projects".
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read projects" ON projects FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members write projects" ON projects FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
  ));`}</CodeBlock>

      <p>What this pattern gets you:</p>

      <ul>
        <li>One schema. Migrations apply once.</li>
        <li>Reporting and analytics over &quot;all tenants&quot; is a single SQL query.</li>
        <li>Connection pooling is straightforward — every request hits the same pool.</li>
        <li>You can move a tenant to another shard later by introducing a routing layer; the schema stays the same.</li>
      </ul>

      <p>The trade-offs you actually feel:</p>

      <ul>
        <li>
          A bug in your RLS policy is a cross-tenant leak. The blast radius is
          higher than schema- or database-per-tenant.
        </li>
        <li>
          Noisy-neighbour performance. A tenant with 100x your normal data
          volume can saturate the indexes. <code>tenant_id</code> partitioning
          mitigates but doesn&apos;t eliminate it.
        </li>
        <li>
          You can&apos;t hand a customer a <code>pg_dump</code> of their data
          without filtering, which sometimes matters for compliance audits.
        </li>
      </ul>

      <Callout variant="tip" title="The tenant_id discipline">
        Every domain query needs <code>WHERE tenant_id = $current</code>. RLS
        enforces it, but you should also write your application code to pass
        it explicitly. The day you accidentally connect with{" "}
        <code>service_role</code> and bypass RLS, the explicit predicate is
        your last line of defence.
      </Callout>

      <ArticleH2 id="schema-per-tenant">Pattern B: schema per tenant</ArticleH2>

      <p>
        Postgres lets you have many schemas in one database. With schema-
        per-tenant, every tenant gets, say, <code>tenant_abc.projects</code>,{" "}
        <code>tenant_xyz.projects</code>, etc. Routing happens via{" "}
        <code>search_path</code>:
      </p>

      <CodeBlock language="sql" filename="schema-per-tenant.sql">{`-- Provision a new tenant.
CREATE SCHEMA tenant_acme;
GRANT USAGE ON SCHEMA tenant_acme TO app_user;

-- Run your normal migrations *into the schema*.
ALTER ROLE app_user IN DATABASE postgres SET search_path = tenant_acme, public;

-- Or per-request:
SET LOCAL search_path = tenant_acme, public;
SELECT * FROM projects; -- resolves to tenant_acme.projects`}</CodeBlock>

      <p>Wins:</p>

      <ul>
        <li>
          Per-tenant <code>pg_dump</code> works. You can give a customer their
          data as a SQL file.
        </li>
        <li>
          Indexes are per-tenant, so a giant tenant doesn&apos;t bloat shared
          indexes.
        </li>
        <li>
          Schema-level GRANTs give a real second line of defence below RLS.
        </li>
      </ul>

      <p>Losses:</p>

      <ul>
        <li>
          Migrations apply N times (once per tenant). Tooling has to know
          this; you can&apos;t just point Drizzle at a single schema and call
          it done.
        </li>
        <li>
          Cross-tenant queries (admin reporting) become a UNION ALL with N
          arms. Past a few hundred tenants this is unworkable.
        </li>
        <li>
          PostgREST and Supabase&apos;s realtime/storage assume schemas they
          know about. Custom schemas need explicit allow-listing.
        </li>
        <li>
          Postgres performance starts to suffer past ~5000 schemas in one
          database. <code>pg_dump</code> alone takes minutes.
        </li>
      </ul>

      <p>
        We&apos;ve seen schema-per-tenant work great for B2B products with up
        to a few hundred tenants. Past that, the operational headaches stack
        up.
      </p>

      <ArticleH2 id="database-per-tenant">Pattern C: database per tenant</ArticleH2>

      <p>The hardest mode, the strongest isolation.</p>

      <p>
        Each tenant gets their own Postgres database. In Supabase terms,
        that&apos;s one Supabase project per tenant. Routing happens at the
        application layer: a tenant lookup decides which connection string to
        use.
      </p>

      <CodeBlock language="ts" filename="route-by-tenant.ts">{`// Pseudo-code: given a subdomain or path prefix, look up the tenant's
// connection string and hand it to your request scope.
const url = await tenantsTable.get(tenantId).connectionString;
const sql = postgres(url, { max: 5, prepare: false });
const rows = await sql\`SELECT id, name FROM projects ORDER BY created_at DESC\`;
await sql.end();`}</CodeBlock>

      <p>Where this wins:</p>

      <ul>
        <li>
          Cross-tenant leaks are structurally impossible. A bug in your code
          can&apos;t leak a customer&apos;s data to another customer.
        </li>
        <li>
          Per-tenant compliance: HIPAA, data residency, &quot;my data on my
          server&quot; for enterprise contracts.
        </li>
        <li>
          Per-tenant scaling. A giant customer gets their own large database;
          a tiny customer gets a tiny one.
        </li>
      </ul>

      <p>Where it hurts:</p>

      <ul>
        <li>
          Pooling per tenant is expensive. If you have 1000 tenants and each
          pool holds 10 connections, you&apos;re looking at 10,000 connections.
          You need a smart router (PgCat, Supavisor in transaction mode) and a
          tiny pool per tenant.
        </li>
        <li>
          Migrations run N times. You need orchestration. Tools like
          Liquibase, Bytebase, or a homegrown runner that knows about your
          tenant list.
        </li>
        <li>
          Provisioning a tenant takes seconds-to-minutes (CREATE DATABASE,
          apply schema, seed data) instead of being a single row insert.
        </li>
      </ul>

      <p>
        For Supabase specifically, &quot;database per tenant&quot; usually
        means &quot;Supabase project per tenant&quot;. This is what some
        agencies do for clients who need full isolation. The admin overhead
        of managing dozens of dashboards is significant — which is why{" "}
        <Link href="/use-cases/agency-multi-client">multi-project admin</Link>{" "}
        is one of the most common reasons people pick our workspace.
      </p>

      <ArticleH2 id="how-to-choose">How to choose</ArticleH2>

      <p>Use this priority order:</p>

      <ol>
        <li>
          <strong>Default to shared table + tenant_id</strong>. Switch away
          only when a concrete pain forces you.
        </li>
        <li>
          <strong>Pick schema per tenant if</strong> your tenants are{" "}
          <em>large but few</em> (think: enterprise SaaS, &lt;500 tenants
          total), regulatory requirements push you toward stronger isolation,
          OR you genuinely need per-tenant <code>pg_dump</code>.
        </li>
        <li>
          <strong>Pick database per tenant if</strong> you have hard
          compliance requirements (HIPAA, data residency per customer), OR
          you have tenants whose individual data volume is large enough to
          justify their own database, OR you&apos;re explicitly pricing on
          &quot;dedicated infrastructure&quot;.
        </li>
      </ol>

      <ArticleH2 id="rls-trapdoors">RLS trapdoors specific to multi-tenant</ArticleH2>

      <p>
        In shared-table mode, RLS is your isolation. The bugs that bite teams
        here are:
      </p>

      <ul>
        <li>
          A policy that joins through <code>memberships</code> but doesn&apos;t
          force the join to be evaluated per row, allowing the planner to
          materialise the whole memberships table and leak it via timing.
        </li>
        <li>
          A function used in a policy that&apos;s declared{" "}
          <code>SECURITY DEFINER</code> and forgets to filter by{" "}
          <code>tenant_id</code>. Now the function leaks across tenants.
        </li>
        <li>
          Background jobs running as <code>service_role</code> that touch many
          tenants&apos; data and forget to set <code>tenant_id</code>{" "}
          explicitly. The audit log shows the writer as <code>service_role</code>,
          which is opaque after the fact.
        </li>
      </ul>

      <p>
        Test the negative case in CI. The{" "}
        <Link href="/blog/row-level-security-postgres-2026">RLS guide</Link>{" "}
        has the exact transaction pattern.
      </p>

      <ArticleH2 id="pooling-implications">Pooling implications</ArticleH2>

      <p>
        Pooling matters more in multi-tenant systems than in single-tenant
        ones, because the number of distinct &quot;connections you need to
        keep warm&quot; multiplies by tenant count.
      </p>

      <ul>
        <li>
          <strong>Shared table</strong>: one pool. Sized to your aggregate
          concurrent-request rate. Easiest.
        </li>
        <li>
          <strong>Schema per tenant</strong>: one pool. <code>SET LOCAL
          search_path</code> per request stays within the same connection.
        </li>
        <li>
          <strong>Database per tenant</strong>: one pool per tenant. Use
          transaction-mode pooling so you can keep each pool tiny (2-5
          connections), and a router in front (Supavisor in transaction mode
          or PgCat in proxy mode).
        </li>
      </ul>

      <p>
        See{" "}
        <Link href="/blog/postgres-connection-pooling-2026">our pooling guide</Link>{" "}
        for the specific configurations.
      </p>

      <ArticleH2 id="operating">Operating each shape</ArticleH2>

      <p>
        Whichever shape you pick, you&apos;ll spend more time looking at
        production data than you expect. Some Day-2 questions to design for:
      </p>

      <ul>
        <li>
          <strong>How do you see one tenant&apos;s data?</strong> In shared
          mode this is a filter. In schema mode this is <code>SET
          search_path</code>. In database mode this is a separate connection.
        </li>
        <li>
          <strong>How do you delete a tenant?</strong> Shared:{" "}
          <code>DELETE FROM tenants</code> with cascading FKs. Schema:{" "}
          <code>DROP SCHEMA tenant_x CASCADE</code>. Database:{" "}
          <code>DROP DATABASE tenant_x</code>.
        </li>
        <li>
          <strong>How do you audit cross-tenant writes?</strong> The audit log
          should record tenant_id explicitly (even when RLS enforces it),
          because your service_role admin tasks bypass RLS and you want to
          know which tenant they touched.
        </li>
      </ul>

      <p>
        These are also exactly the questions an admin tool needs to answer.
        For shared-table tenants,{" "}
        <Link href="/features">Suparbase</Link> filters every list by tenant
        with a saved view; for schema-per-tenant, you switch the connection&apos;s
        <code>search_path</code> setting; for database-per-tenant, you keep
        each project as a separate connection in your workspace. All three
        are valid; the shape that matches your tenancy model is the right one.
      </p>

      <p>
        The thing not to do is try to support all three at once. Pick the
        pattern that fits your business shape, build for it, and revisit when
        the pain tells you to.
      </p>
    </>
  );
}
