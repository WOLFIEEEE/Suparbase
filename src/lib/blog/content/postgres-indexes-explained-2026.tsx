import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-indexes-explained-2026",
  title: "Postgres Indexes Explained, Visually: btree, GIN, BRIN, GiST, Hash",
  description:
    "Every Postgres index type, what it does, when to use it. A 2026 visual guide with concrete examples and the surprising performance numbers.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 13,
  tags: ["postgres", "indexes", "performance"],
  related: ["postgres-explain-analyze-2026", "jsonb-vs-tables", "postgres-partitioning-at-scale"],
  toc: [
    { id: "the-five", label: "The five index types you need to know" },
    { id: "btree", label: "btree: the default" },
    { id: "hash", label: "hash: rarely useful" },
    { id: "gin", label: "GIN: for arrays, jsonb, full-text" },
    { id: "gist", label: "GiST: for ranges and geometry" },
    { id: "brin", label: "BRIN: for time-series at scale" },
    { id: "covering", label: "Covering indexes" },
    { id: "partial", label: "Partial indexes" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Postgres ships seven index types out of the box. You will use five
        of them. Picking the right one is one of the few performance
        decisions where a small amount of knowledge produces a 100x speedup.
      </p>

      <ArticleH2 id="the-five">The five index types you need to know</ArticleH2>
      <p>btree, hash, GIN, GiST, BRIN. Plus the bloom and SP-GiST extensions, which are situational.</p>

      <ArticleH2 id="btree">btree: the default</ArticleH2>
      <p>
        Balanced binary tree. Default for <code>CREATE INDEX</code>. Sorted
        traversal, equality and range queries, prefix matching for
        strings (with the right opclass). The right answer 80% of the time.
      </p>
      <CodeBlock language="sql">{`CREATE INDEX users_email_idx ON users (email);
-- Supports: WHERE email = ?, WHERE email > ?, ORDER BY email`}</CodeBlock>
      <p>Composite indexes: column order matters. The first column is queryable on its own; later columns help only when the earlier ones are also in the WHERE clause.</p>
      <CodeBlock language="sql">{`CREATE INDEX posts_tenant_status_idx ON posts (tenant_id, status);
-- Helps: WHERE tenant_id = ?
-- Helps: WHERE tenant_id = ? AND status = ?
-- Does NOT help much: WHERE status = ? (alone)`}</CodeBlock>

      <ArticleH2 id="hash">hash: rarely useful</ArticleH2>
      <p>
        Faster than btree for exact-equality lookups; doesn&apos;t support
        ranges or sorts. In practice almost never the right pick because
        btree is already fast for equality and supports more. Skip unless
        you have a measured reason.
      </p>

      <ArticleH2 id="gin">GIN: for arrays, jsonb, full-text</ArticleH2>
      <p>
        Generalised Inverted Index. Indexes the &quot;tokens&quot; inside a
        composite value. Three big use cases:
      </p>
      <ul>
        <li>
          <strong>Array columns</strong>: <code>WHERE tags @&gt; ARRAY['rls']</code>.
        </li>
        <li>
          <strong>jsonb columns</strong>: <code>WHERE payload @&gt; '{`{"status":"paid"}`}'</code>.
        </li>
        <li>
          <strong>Full-text search</strong>: <code>WHERE tsv @@ to_tsquery(...)</code>.
        </li>
      </ul>
      <CodeBlock language="sql">{`CREATE INDEX orders_payload_gin ON orders USING gin (payload jsonb_path_ops);
-- jsonb_path_ops is smaller and faster than the default; covers @> only`}</CodeBlock>
      <p>
        GIN indexes are slower to build and slower to update than btree.
        Don&apos;t put one on a high-write column unless you really need it.
      </p>

      <ArticleH2 id="gist">GiST: for ranges and geometry</ArticleH2>
      <p>
        Generalised Search Tree. Used for any type with an &quot;is-within&quot;
        or &quot;overlaps&quot; operator. Common applications:
      </p>
      <ul>
        <li>PostGIS geometry: <code>WHERE location && bounding_box</code>.</li>
        <li>Range types: <code>WHERE valid_during && tstzrange(...)</code>.</li>
        <li>Trigram fuzzy matching: <code>WHERE name % 'jonh'</code> (yes, fuzzy).</li>
      </ul>
      <Callout variant="tip" title="GiST or GIN for trigrams?">
        For <code>pg_trgm</code> indexes, GIN is faster for many distinct
        terms; GiST is smaller and faster to update. For typical SaaS
        text search, GIN wins.
      </Callout>

      <ArticleH2 id="brin">BRIN: for time-series at scale</ArticleH2>
      <p>
        Block Range INdex. Stores summary statistics per range of pages
        instead of per row. Tiny on disk; perfect for naturally-ordered
        columns like <code>created_at</code> on append-only tables.
      </p>
      <CodeBlock language="sql">{`CREATE INDEX events_created_brin ON events USING brin (created_at);
-- 1000x smaller than btree on a 100M-row table
-- Almost as fast for range queries on a column that's naturally sorted`}</CodeBlock>
      <p>
        BRIN is the right answer for time-series tables where the data is
        naturally clustered in insertion order (which Postgres preserves
        on append-only writes). On a randomly-ordered column, BRIN is
        useless.
      </p>

      <ArticleH2 id="covering">Covering indexes</ArticleH2>
      <p>
        Add an <code>INCLUDE</code> clause to put extra columns in the
        index leaf so the planner can avoid a heap fetch.
      </p>
      <CodeBlock language="sql">{`CREATE INDEX posts_author_idx
  ON posts (author_id)
  INCLUDE (title, status);
-- WHERE author_id = ? AND SELECT title, status
-- can be answered without touching the table heap`}</CodeBlock>
      <p>
        The trade-off: bigger index, slower writes (more bytes to update).
        Use sparingly for hot read queries.
      </p>

      <ArticleH2 id="partial">Partial indexes</ArticleH2>
      <p>
        Index only the rows that match a predicate. Smaller, faster, more
        targeted.
      </p>
      <CodeBlock language="sql">{`-- Indexes only the unarchived posts; archived ones aren't in the index
CREATE INDEX posts_active_idx
  ON posts (tenant_id, created_at DESC)
  WHERE archived = false;`}</CodeBlock>
      <p>
        Hugely effective when a large fraction of rows match a single
        predicate. Saves disk and write overhead.
      </p>

      <Callout variant="sparkle" title="The mental model">
        btree by default. GIN for &quot;tokens within a value&quot;
        (arrays, jsonb, full-text). GiST for &quot;ranges and shapes&quot;.
        BRIN for &quot;append-only time-series&quot;. Add INCLUDE for
        covering reads; add WHERE for partial indexes.
      </Callout>

      <p>
        Once you can read{" "}
        <Link href="/blog/postgres-explain-analyze-2026">EXPLAIN ANALYZE</Link>{" "}
        fluently and pick the right index type, most performance problems
        in Postgres go from &quot;hours of investigation&quot; to
        &quot;minutes of analysis followed by a single DDL&quot;.
      </p>
    </>
  );
}
