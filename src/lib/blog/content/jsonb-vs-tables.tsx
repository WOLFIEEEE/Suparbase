import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "jsonb-vs-tables",
  title: "JSONB vs Tables: A Decision Framework for Postgres Schema Design",
  description:
    "When to use Postgres' JSONB column vs columns vs a separate table. A 2026 decision framework with concrete queries, indexing implications, and the bug patterns of each.",
  publishedAt: "2026-05-13",
  updatedAt: "2026-05-14",
  readingMinutes: 13,
  tags: ["postgres", "schema", "jsonb"],
  related: ["multi-tenant-saas-postgres", "zero-downtime-migrations", "ai-assisted-database-admin"],
  toc: [
    { id: "the-question", label: "The question, sharpened" },
    { id: "framework", label: "A three-question framework" },
    { id: "jsonb-strengths", label: "Where JSONB is the right answer" },
    { id: "table-strengths", label: "Where a real table beats JSONB" },
    { id: "hybrid", label: "The hybrid pattern that's usually correct" },
    { id: "indexing", label: "Indexing implications" },
    { id: "bugs", label: "The bug patterns" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        &quot;Should this be a column, or should it live inside a{" "}
        <code>jsonb</code> blob?&quot; is one of the most common schema
        questions in Postgres-based applications. The wrong answer either
        produces 200 columns nobody can navigate, or a JSON blob that{" "}
        <code>GROUP BY</code> won&apos;t touch. The right answer is almost
        always &quot;some of each&quot;, and there&apos;s a framework for
        deciding which goes where.
      </p>

      <ArticleH2 id="the-question">The question, sharpened</ArticleH2>

      <p>
        The decision isn&apos;t binary. There are actually four resting
        states for a piece of structured data in Postgres:
      </p>

      <ol>
        <li>A column on the row&apos;s main table.</li>
        <li>A column on a separate but related table (1:1 or 1:N).</li>
        <li>A key inside a <code>jsonb</code> column on the main table.</li>
        <li>A row in an EAV-style key/value table (rare, almost always a mistake).</li>
      </ol>

      <p>Most of the day-to-day choices are between options 1 and 3.</p>

      <ArticleH2 id="framework">A three-question framework</ArticleH2>

      <p>For any new field, ask:</p>

      <ol>
        <li>
          <strong>Will I query it in a <code>WHERE</code> clause?</strong> If
          yes, it wants to be a real column with an index. If no, it can live
          in JSONB.
        </li>
        <li>
          <strong>Does it have a stable shape across rows?</strong> If yes
          (every row has it, with the same type), it&apos;s a column. If no
          (it varies per row, or it&apos;s populated by tenants who can add
          arbitrary keys), it&apos;s JSONB.
        </li>
        <li>
          <strong>Will I aggregate over it?</strong> SUM, AVG, COUNT, GROUP
          BY all favour real columns. JSONB aggregates are possible but
          painful.
        </li>
      </ol>

      <p>
        If all three answers point the same way, the decision is easy. If
        they conflict, you have a hybrid case and you&apos;re probably
        looking at the hybrid pattern below.
      </p>

      <ArticleH2 id="jsonb-strengths">Where JSONB is the right answer</ArticleH2>

      <p>JSONB earns its keep when:</p>

      <h3>1. Tenant-supplied data with no shape contract</h3>

      <p>
        Webhook payloads, third-party integration responses, user-defined
        custom fields. You don&apos;t control what comes in. You&apos;ll
        usually pull it out with a <code>-&gt;&gt;</code> operator when you
        need it, and you&apos;ll rarely <code>WHERE</code> against it.
      </p>

      <CodeBlock language="sql" filename="webhook-payloads.sql">{`CREATE TABLE webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,                       -- stripe, github, etc.
  event_type  text NOT NULL,                       -- 'invoice.paid'
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_source_type_idx ON webhook_events (source, event_type);`}</CodeBlock>

      <h3>2. Wide, sparsely-populated metadata</h3>

      <p>
        A <code>user_metadata</code> field that&apos;s 30 possible keys and 4
        are populated for any given row. Promoting them all to columns
        creates a sparse, hard-to-evolve table. JSONB nests them comfortably.
      </p>

      <h3>3. Append-only audit / analytics payloads</h3>

      <p>
        Anything you write once and read in aggregate later. JSON
        compression and storage costs are reasonable; you can always promote
        a frequently-queried key to a column later.
      </p>

      <ArticleH2 id="table-strengths">Where a real table beats JSONB</ArticleH2>

      <p>The cases where you&apos;ll regret the JSONB choice:</p>

      <h3>1. Anything you filter on</h3>

      <p>
        <code>WHERE metadata-&gt;&gt;'status' = 'active'</code> can be indexed
        (jsonb_path_ops, GIN), but the query planner is worse at estimating
        cardinality through JSONB than through a column. A <code>status</code>{" "}
        column with a btree index beats the JSONB equivalent every time.
      </p>

      <h3>2. Foreign keys</h3>

      <p>
        You cannot put a FK constraint on a JSONB key. If <code>metadata-&gt;
        &gt;'owner_id'</code> is logically a foreign key to{" "}
        <code>users.id</code>, the database can&apos;t enforce it and you&apos;ll
        eventually have an orphan reference. Always promote FKs out of JSONB.
      </p>

      <h3>3. Anything you display in the UI</h3>

      <p>
        Building a list view, a filter UI, or an export from JSONB is
        irritating in every framework. Column-driven UIs (including{" "}
        <Link href="/features">our admin views</Link>) need real columns to
        give users typed filters, sorting, and inline editing.
      </p>

      <h3>4. Anything you join through</h3>

      <p>
        JSONB joins are technically possible (lateral joins with
        jsonb_array_elements) but the query plans are slow and unintuitive. If
        a piece of data is the basis for a join, it wants its own table.
      </p>

      <ArticleH2 id="hybrid">The hybrid pattern that&apos;s usually correct</ArticleH2>

      <p>
        For most real tables, the right shape is:
      </p>

      <CodeBlock language="sql" filename="hybrid-schema.sql">{`CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  customer_id   uuid REFERENCES customers(id),

  -- Promoted: anything queried, filtered, joined, or aggregated.
  status        text NOT NULL,
  total_cents   bigint NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  placed_at     timestamptz NOT NULL DEFAULT now(),

  -- Kept in JSONB: provider-specific payloads, free-form notes, anything
  -- we don't have a query for *today*.
  provider_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);`}</CodeBlock>

      <p>
        The rule of thumb: <em>promote on demand</em>. Start everything in
        JSONB. The first time you write a <code>WHERE</code> against a key,
        promote it to a column with a migration. The audit-log structure of
        Postgres makes this safe (see{" "}
        <Link href="/blog/zero-downtime-migrations">the migrations guide</Link>
        ).
      </p>

      <Callout variant="tip" title="The Stripe-style pattern">
        Stripe&apos;s API is the canonical example of this. Every object has
        first-class columns for the fields they care about (status, amount,
        currency) and a <code>metadata</code> JSONB for anything the customer
        attached. The two coexist and serve different purposes.
      </Callout>

      <ArticleH2 id="indexing">Indexing implications</ArticleH2>

      <p>Quick reference of what&apos;s available:</p>

      <ul>
        <li>
          <strong>Columns</strong>: btree (the default), brin (for sorted
          time-series), hash (rarely useful), gin/gist for fulltext + array.
        </li>
        <li>
          <strong>Whole JSONB</strong>: GIN with default ops class lets you
          query &quot;does this row&apos;s payload contain X anywhere?&quot;
          via the <code>@&gt;</code> operator. Slow to build, big on disk.
        </li>
        <li>
          <strong>JSONB with jsonb_path_ops</strong>: smaller index, faster
          to maintain, only supports <code>@&gt;</code> queries (no
          existence-of-key checks). The right choice 90% of the time.
        </li>
        <li>
          <strong>Functional indexes on a JSONB expression</strong>:{" "}
          <code>CREATE INDEX ON t ((payload-&gt;&gt;'status'))</code>. The
          single best technique for &quot;I want column-like indexing on this
          one JSONB key&quot;.
        </li>
      </ul>

      <CodeBlock language="sql" filename="jsonb-index.sql">{`-- Want to filter on \`payload->'status'\` like a column?
CREATE INDEX orders_payload_status_idx
  ON orders ((provider_data ->> 'status'));

-- Now this query is as fast as if status were a column.
SELECT count(*) FROM orders WHERE provider_data ->> 'status' = 'paid';`}</CodeBlock>

      <p>
        Functional indexes are a great escape hatch when you didn&apos;t
        promote a JSONB key but suddenly need to query it.
      </p>

      <ArticleH2 id="bugs">The bug patterns</ArticleH2>

      <h3>1. The silent type drift</h3>

      <p>
        JSONB doesn&apos;t enforce types. <code>metadata-&gt;&gt;'amount'</code>{" "}
        returns text. Comparing it to a number works in some Postgres
        contexts and silently fails in others. Always cast explicitly:{" "}
        <code>(metadata-&gt;&gt;'amount')::numeric</code>.
      </p>

      <h3>2. The null vs missing key trap</h3>

      <p>
        <code>payload-&gt;&gt;'foo'</code> returns NULL whether <code>foo</code>{" "}
        is missing or <code>foo: null</code>. <code>payload ? 'foo'</code> is
        the existence check. If those two cases mean different things in your
        domain, write the queries explicitly.
      </p>

      <h3>3. The accidental schema proliferation</h3>

      <p>
        Teams that lean on JSONB too hard end up with three different
        spellings of the same key (<code>userId</code>, <code>user_id</code>,{" "}
        <code>uid</code>) across rows because nothing enforces consistency.
        The fix is a CHECK constraint with <code>jsonb_typeof</code> or a
        function that runs on INSERT — or just promote it to a column.
      </p>

      <h3>4. The TOAST chunking surprise</h3>

      <p>
        Large JSONB values get TOAST-ed (compressed and stored out-of-line).
        That makes <em>reads</em> of them slow because the page needs to be
        decompressed. A <code>SELECT *</code> on a table with multi-KB JSONB
        per row is much slower than a <code>SELECT col1, col2</code>. Be
        explicit about which columns you fetch.
      </p>

      <p>
        Used well, JSONB is one of Postgres&apos;s superpowers. Used as a
        bag-of-everything, it&apos;s the source of an entire class of bugs.
        The framework above is what we use day-to-day to keep the line clear.
      </p>
    </>
  );
}
