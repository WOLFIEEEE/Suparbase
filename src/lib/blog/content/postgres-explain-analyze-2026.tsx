import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-explain-analyze-2026",
  title: "Reading Postgres EXPLAIN ANALYZE: The 2026 Guide",
  description:
    "A field guide to Postgres EXPLAIN ANALYZE in 2026. The operators that matter, the numbers to look at, and the four patterns that explain 90% of slow queries.",
  publishedAt: "2026-05-12",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["postgres", "performance", "explain"],
  related: ["postgres-indexes-explained-2026", "postgres-mvcc-when-it-bites", "postgres-observability-stack-2026"],
  toc: [
    { id: "the-shape", label: "The shape of an EXPLAIN output" },
    { id: "key-operators", label: "Operators that matter" },
    { id: "numbers-that-lie", label: "Numbers that lie" },
    { id: "four-patterns", label: "Four patterns" },
    { id: "buffers", label: "BUFFERS is your friend" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        EXPLAIN ANALYZE is the single most useful Postgres tool, and the
        one most teams use timidly. Past 2024 the output format settled, the
        operators got fully documented, and AI assistants can read the trees
        for you. In 2026 it&apos;s the obvious starting point when anything is
        slow.
      </p>

      <ArticleH2 id="the-shape">The shape of an EXPLAIN output</ArticleH2>
      <p>
        Every plan is a tree of nodes. Each node has a type (Seq Scan, Index
        Scan, Hash Join, etc.), an estimated cost, an actual time, and an
        actual row count.
      </p>
      <CodeBlock language="sql" filename="explain-example.sql">{`EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT u.id, u.email, count(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.created_at > now() - interval '7 days'
GROUP BY u.id, u.email
ORDER BY post_count DESC
LIMIT 10;`}</CodeBlock>
      <p>
        Read the tree bottom-up. Each node feeds its parent. The interesting
        nodes are usually the leaves and the joins.
      </p>

      <ArticleH2 id="key-operators">Operators that matter</ArticleH2>
      <ul>
        <li>
          <strong>Seq Scan</strong>: reads every row in a table. Fine on small
          tables, a problem on big ones. If you see this on a table over a few
          thousand rows in a hot query, you need an index.
        </li>
        <li>
          <strong>Index Scan</strong>: uses an index. Fast. Good.
        </li>
        <li>
          <strong>Index Only Scan</strong>: uses an index AND doesn&apos;t need
          to fetch the heap. Even better. Requires every column referenced to
          be in the index (covering index).
        </li>
        <li>
          <strong>Bitmap Heap Scan</strong>: uses an index but in a different
          way; Postgres builds a bitmap of matching pages then reads them.
          Common when several conditions can use indexes that combine via
          AND/OR.
        </li>
        <li>
          <strong>Nested Loop</strong>: joins by iterating one side and
          looking up the other. Fast for small driving tables. Catastrophic
          for big ones.
        </li>
        <li>
          <strong>Hash Join</strong>: builds a hash on one side, scans the
          other. Good for big-to-big.
        </li>
        <li>
          <strong>Merge Join</strong>: requires both sides sorted. Cheap if
          you happen to have indexes that sort the right way; otherwise the
          sort step adds time.
        </li>
        <li>
          <strong>Sort</strong>: ordering rows. Expensive if it doesn&apos;t
          fit in <code>work_mem</code> (you&apos;ll see &quot;external merge
          Disk&quot; in the plan).
        </li>
      </ul>

      <ArticleH2 id="numbers-that-lie">Numbers that lie</ArticleH2>
      <p>The trap most beginners fall into: the planner&apos;s cost estimate.</p>
      <p>
        Cost is a unitless number Postgres uses internally to pick the
        cheapest plan. It&apos;s not seconds, not microseconds. It correlates
        loosely with reality. Don&apos;t compare costs across queries; only
        within a single query&apos;s alternatives.
      </p>
      <p>
        What actually matters: <strong>actual time</strong>, <strong>rows</strong>{" "}
        (compare estimated vs actual: if they&apos;re wildly different, your
        statistics are stale), and <strong>loops</strong> (a node with{" "}
        <code>loops=1000</code> ran 1000 times, even if each ran fast).
      </p>

      <Callout variant="tip" title="Always ANALYZE, never just EXPLAIN">
        <code>EXPLAIN</code> alone shows estimated cost. <code>EXPLAIN
        ANALYZE</code> actually runs the query and shows real numbers. The
        difference between estimate and reality is where bugs live.
      </Callout>

      <ArticleH2 id="four-patterns">Four patterns that explain 90% of slow queries</ArticleH2>

      <h3>1. Seq Scan on a big table</h3>
      <p>
        Missing index. Add one on the column(s) in the <code>WHERE</code>{" "}
        clause. For composite predicates, the order matters: the most
        selective column first.
      </p>

      <h3>2. Nested Loop with huge outer rows</h3>
      <p>
        The planner expected a small driving table; it got a big one. Either
        the statistics are stale (run <code>ANALYZE</code>) or you need a
        different join strategy. Add an index on the inner table&apos;s join
        column.
      </p>

      <h3>3. Sort spilling to disk</h3>
      <p>
        <code>work_mem</code> is too small for the sort. Either increase it
        for that session, or arrange to use a presorted index, or limit the
        result set before sorting.
      </p>

      <h3>4. Estimated vs actual rows wildly different</h3>
      <p>
        Stale statistics. Run <code>ANALYZE table_name</code>. If it
        persists, look at <code>default_statistics_target</code> for that
        column or add multi-column statistics with{" "}
        <code>CREATE STATISTICS</code>.
      </p>

      <ArticleH2 id="buffers">BUFFERS is your friend</ArticleH2>
      <p>
        Add <code>BUFFERS</code> to your EXPLAIN ANALYZE. It tells you how
        many 8KB pages the query read from cache vs disk. A query that
        reads 1M buffers is doing a lot of I/O regardless of how cleverly
        the plan looks.
      </p>
      <CodeBlock language="sql">{`EXPLAIN (ANALYZE, BUFFERS) SELECT ...`}</CodeBlock>
      <p>
        <code>shared hit</code> means cached; <code>shared read</code> means
        from disk; <code>shared dirtied</code> means a write happened in the
        query. The ratio of hit to read tells you whether you have a
        memory problem or a query problem.
      </p>

      <p>
        Once you can read EXPLAIN ANALYZE fluently, you can fix most
        performance problems in minutes instead of hours. For the bigger
        picture of when to add what, see{" "}
        <Link href="/blog/postgres-indexes-explained-2026">our indexes guide</Link>.
      </p>
    </>
  );
}
