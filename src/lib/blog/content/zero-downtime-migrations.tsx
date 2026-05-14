import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "zero-downtime-migrations",
  title: "Zero-Downtime Postgres Migrations: Patterns That Actually Work",
  description:
    "Add columns, drop columns, rename, change types, and re-shape big tables without a maintenance window. Production-tested Postgres migration patterns for 2026, with the locks each one takes.",
  publishedAt: "2026-05-06",
  updatedAt: "2026-05-14",
  readingMinutes: 16,
  tags: ["postgres", "migrations", "operations"],
  related: ["multi-tenant-saas-postgres", "supabase-vs-self-hosted-postgres", "jsonb-vs-tables"],
  toc: [
    { id: "the-rules", label: "Three rules that prevent 99% of outages" },
    { id: "add-column", label: "Adding a column" },
    { id: "drop-column", label: "Dropping a column" },
    { id: "rename", label: "Renaming a column" },
    { id: "change-type", label: "Changing a column's type" },
    { id: "split-table", label: "Splitting a table" },
    { id: "tooling", label: "Tooling and CI" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        The migration that took out an afternoon of customer support was rarely
        a complicated one. It&apos;s usually an{" "}
        <code>ALTER TABLE ... ALTER COLUMN ... TYPE</code> that locked a busy
        table for two minutes, or a <code>DROP COLUMN</code> that broke a stale
        client. The pattern is always the same: a deploy that did the
        &quot;right&quot; thing in development hit production reality and
        stalled.
      </p>

      <p>
        Postgres has the tools to do every shape of schema change online. They
        require a specific kind of discipline. This is the playbook.
      </p>

      <ArticleH2 id="the-rules">Three rules that prevent 99% of outages</ArticleH2>

      <ol>
        <li>
          <strong>Never block a write longer than a single statement&apos;s
          execution.</strong> If your migration holds <code>ACCESS EXCLUSIVE</code>{" "}
          on a hot table while it scans rows, your application stalls.
        </li>
        <li>
          <strong>Deploy schema changes and application changes in separate
          releases.</strong> The schema must always work with both the
          previous version and the next version of the application.
        </li>
        <li>
          <strong>Backfills are their own deploy.</strong> Don&apos;t put a
          backfill in the same step as a schema change. They have different
          failure modes.
        </li>
      </ol>

      <p>
        Everything below is a specialisation of these three rules.
      </p>

      <ArticleH2 id="add-column">Adding a column</ArticleH2>

      <p>
        The easiest case, and the one teams still get wrong because of the
        default-value trap.
      </p>

      <h3>Safe: NULL default, no validation</h3>

      <CodeBlock language="sql" filename="add-column-safe.sql">{`-- Postgres 11+: this is instant. Just metadata.
ALTER TABLE orders ADD COLUMN tax_rate numeric;`}</CodeBlock>

      <h3>Also safe (Postgres 11+): non-volatile default</h3>

      <CodeBlock language="sql" filename="add-column-default.sql">{`-- Non-volatile default. Postgres stores the default in metadata; existing
-- rows return it virtually. No table rewrite.
ALTER TABLE orders ADD COLUMN currency text NOT NULL DEFAULT 'USD';`}</CodeBlock>

      <Callout variant="watch-out" title="Volatile defaults still rewrite">
        A default like <code>DEFAULT now()</code> or{" "}
        <code>DEFAULT gen_random_uuid()</code> is volatile — every existing
        row needs a distinct value, so Postgres rewrites the whole table.
        That&apos;s an <code>ACCESS EXCLUSIVE</code> lock for as long as the
        rewrite takes. Don&apos;t do this on a hot table.
      </Callout>

      <h3>Unsafe: adding NOT NULL without a default</h3>

      <CodeBlock language="sql" filename="add-column-unsafe.sql">{`-- This blocks. Every existing row must have a value before the constraint
-- can be enforced, and Postgres takes ACCESS EXCLUSIVE while it validates.
ALTER TABLE orders ADD COLUMN region text NOT NULL;`}</CodeBlock>

      <p>The safe version is a three-step deploy:</p>

      <CodeBlock language="sql" filename="add-column-three-step.sql">{`-- Step 1 (deploy A). Nullable column. Instant.
ALTER TABLE orders ADD COLUMN region text;

-- Step 2 (background backfill). Update old rows in batches.
UPDATE orders SET region = 'us'
WHERE region IS NULL AND id IN (
  SELECT id FROM orders WHERE region IS NULL LIMIT 10000
);
-- Run repeatedly until no rows updated.

-- Step 3 (deploy B, after app writes region for every new row).
-- Add the NOT NULL constraint as NOT VALID first, then VALIDATE.
ALTER TABLE orders ADD CONSTRAINT orders_region_not_null
  CHECK (region IS NOT NULL) NOT VALID;
-- VALIDATE only takes a SHARE UPDATE EXCLUSIVE lock, doesn't block reads/writes.
ALTER TABLE orders VALIDATE CONSTRAINT orders_region_not_null;

-- Step 4 (deploy C). Convert the check to a proper NOT NULL.
ALTER TABLE orders ALTER COLUMN region SET NOT NULL;
-- The previous CHECK lets Postgres skip a full scan; this is instant.
ALTER TABLE orders DROP CONSTRAINT orders_region_not_null;`}</CodeBlock>

      <p>
        Four steps to add NOT NULL safely. Worth it.
      </p>

      <ArticleH2 id="drop-column">Dropping a column</ArticleH2>

      <p>
        <code>ALTER TABLE ... DROP COLUMN</code> takes an <code>ACCESS
        EXCLUSIVE</code> lock but the work itself is instant — Postgres just
        marks the column dead, doesn&apos;t reclaim the space. The space comes
        back via the next VACUUM.
      </p>

      <p>The hard part is the application coordination:</p>

      <ol>
        <li>
          <strong>Deploy A:</strong> Stop writing to the column. Make the
          ORM&apos;s schema treat it as absent. <em>Don&apos;t drop yet.</em>
        </li>
        <li>
          Wait for the deploy to fully roll out and for any background
          workers that might still write to the column to roll over.
        </li>
        <li>
          <strong>Deploy B:</strong> The migration drops the column.
        </li>
      </ol>

      <p>
        Skipping step 1 is what causes &quot;column doesn&apos;t exist&quot;
        errors from old clients during a rolling deploy.
      </p>

      <ArticleH2 id="rename">Renaming a column</ArticleH2>

      <p>
        <code>ALTER TABLE ... RENAME COLUMN</code> is instant. The problem is
        that during a rolling deploy, the old version of your app refers to
        the old name, and the new version refers to the new name. Both can
        be live at the same time.
      </p>

      <p>The pattern: add the new column, dual-write, swap reads, drop the old column.</p>

      <CodeBlock language="sql" filename="rename-column.sql">{`-- Deploy A: add the new column.
ALTER TABLE accounts ADD COLUMN display_name text;

-- Deploy B: dual-write. App writes both \`name\` and \`display_name\` on every
-- INSERT/UPDATE. Reads still use \`name\`.
UPDATE accounts SET display_name = name WHERE display_name IS NULL;
-- (Backfill in batches as above.)

-- Deploy C: app reads display_name, still writes both.

-- Deploy D: app stops writing \`name\`.

-- Deploy E: drop the old column.
ALTER TABLE accounts DROP COLUMN name;`}</CodeBlock>

      <p>
        Five deploys to rename a column safely. Most teams do three (deploy
        the dual-write, deploy the read-switch, deploy the drop). That works
        when your deploy cycle is fast and you can verify each step.
      </p>

      <ArticleH2 id="change-type">Changing a column&apos;s type</ArticleH2>

      <p>
        <code>ALTER COLUMN ... TYPE</code> rewrites the table for almost any
        non-trivial conversion. For a hot table that&apos;s an outage waiting
        to happen.
      </p>

      <h3>The general pattern: shadow column</h3>

      <CodeBlock language="sql" filename="type-change.sql">{`-- Step 1: add a new column with the target type.
ALTER TABLE invoices ADD COLUMN total_cents bigint;

-- Step 2: backfill in batches.
UPDATE invoices SET total_cents = (total * 100)::bigint
WHERE total_cents IS NULL AND id IN (
  SELECT id FROM invoices WHERE total_cents IS NULL LIMIT 5000
);

-- Step 3: deploy a version of the app that dual-writes (writes both \`total\`
-- and \`total_cents\` on every change). Reads still use \`total\`.

-- Step 4: deploy a version that reads \`total_cents\` and still dual-writes.

-- Step 5: deploy a version that only writes \`total_cents\`.

-- Step 6: drop the old column.
ALTER TABLE invoices DROP COLUMN total;`}</CodeBlock>

      <p>
        Six steps. Annoying but boring; boring is what you want.
      </p>

      <h3>The shortcut Postgres 16+ gave us</h3>

      <p>
        For some narrow type changes, <code>ALTER COLUMN ... TYPE ... USING ...
        </code> can complete without a table rewrite. <code>varchar(50)</code>{" "}
        to <code>varchar(100)</code> is metadata-only. <code>text</code> to{" "}
        <code>varchar(N)</code> requires a scan if N is shorter than existing
        values. Always test on a copy of production first.
      </p>

      <ArticleH2 id="split-table">Splitting a table</ArticleH2>

      <p>
        A common shape: <code>users</code> grew to carry every user-related
        field, and you want to extract <code>profiles</code> into its own
        table. This is half a migration and half a refactor.
      </p>

      <ol>
        <li>
          <strong>Create the new table.</strong> Same primary key, same columns
          you want to split out.
        </li>
        <li>
          <strong>Dual-write.</strong> Triggers on the old table that mirror
          inserts and updates to the new table.
        </li>
        <li>
          <strong>Backfill</strong> from the old table to the new, in batches.
        </li>
        <li>
          <strong>Swap reads</strong> in the application code, one query at a
          time.
        </li>
        <li>
          <strong>Stop the dual-write</strong> by dropping the trigger.
        </li>
        <li>
          <strong>Drop the columns</strong> from the old table.
        </li>
      </ol>

      <Callout variant="tip" title="Triggers vs application dual-write">
        Triggers are easier to reason about because they can&apos;t miss a
        write. Application-level dual-write is faster but you have to verify
        every code path. We default to triggers for split-table migrations
        and switch to application dual-write only when trigger overhead
        matters (which is rarely).
      </Callout>

      <ArticleH2 id="tooling" >Tooling and CI</ArticleH2>

      <p>The bits of tooling that actually help:</p>

      <ul>
        <li>
          <strong>A migration runner that knows about transactions.</strong>{" "}
          Drizzle, Prisma, Sqitch, Flyway. Pick one. Don&apos;t hand-run SQL.
        </li>
        <li>
          <strong>A linter for unsafe migrations.</strong>{" "}
          <a href="https://github.com/sbdchd/squawk">Squawk</a> catches the
          obvious mistakes (adding a column with a volatile default, locking
          patterns) in CI. Cheap and worth installing on day one.
        </li>
        <li>
          <strong>Statement timeouts on the production database.</strong> Set{" "}
          <code>statement_timeout</code> to something reasonable (60 seconds)
          on your migration role. Better to fail loudly than block forever.
        </li>
        <li>
          <strong>A way to look at the database during the migration.</strong>{" "}
          A SQL playground that&apos;s already authed and read-only by default
          beats fumbling with <code>psql</code> when something stalls. The{" "}
          <Link href="/features">SQL playground</Link> in Suparbase is built
          for exactly this — read-only by default with a clear write-mode
          toggle and statement timeout.
        </li>
        <li>
          <strong>Lock observability.</strong> A query in your toolbox to
          show current locks (<code>pg_locks</code> joined to{" "}
          <code>pg_stat_activity</code>) so you can see what&apos;s blocked
          when something goes wrong.
        </li>
      </ul>

      <p>
        None of this is exotic. It&apos;s the discipline of always assuming
        production traffic is live and your migration has to coexist with the
        previous version of the application. Once you internalise that, the
        rest is mechanical.
      </p>
    </>
  );
}
