import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgres-full-text-search-2026",
  title: "Postgres Full-Text Search in 2026: Still Worth It?",
  description:
    "Postgres full-text search has been around forever. In a 2026 world of pgvector and external search engines, when does it still make sense? Benchmarks and trade-offs.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["postgres", "search", "fts"],
  related: ["postgres-indexes-explained-2026", "pgvector-rag-production", "vector-databases-ranked-2026"],
  toc: [
    { id: "what-fts-does", label: "What FTS does" },
    { id: "when-fts-wins", label: "When FTS wins" },
    { id: "when-vector-wins", label: "When vector wins" },
    { id: "hybrid", label: "The hybrid pattern" },
    { id: "setup", label: "Setup that actually works" },
    { id: "performance", label: "Performance budget" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Postgres has had full-text search since version 8.3 (2008). For most
        of that time the answer to &quot;should I use FTS or an external
        engine?&quot; was &quot;use Elasticsearch&quot;. In 2026, with
        pgvector mature and FTS performance steadily improving, the
        landscape is different.
      </p>

      <ArticleH2 id="what-fts-does">What Postgres FTS does</ArticleH2>
      <p>
        Postgres FTS tokenises text into a <code>tsvector</code>, supports
        stemming and stop-words for major languages, and matches it against
        a <code>tsquery</code>. With a GIN index, queries are fast.
      </p>
      <CodeBlock language="sql" filename="fts-setup.sql">{`-- Add a generated tsvector column
ALTER TABLE posts
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')),   'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

-- GIN index on it
CREATE INDEX posts_search_idx ON posts USING gin (search_tsv);

-- Query
SELECT id, title, ts_rank(search_tsv, q) AS rank
FROM posts, to_tsquery('english', 'postgres & search') q
WHERE search_tsv @@ q
ORDER BY rank DESC
LIMIT 10;`}</CodeBlock>
      <p>
        That&apos;s it. No second system. No sync pipeline. The query runs
        in tens of milliseconds against millions of rows.
      </p>

      <ArticleH2 id="when-fts-wins">When FTS wins</ArticleH2>
      <ul>
        <li>
          Exact-keyword and prefix matching is the dominant query type. Tags,
          product names, SKUs, technical content.
        </li>
        <li>
          The text fits in the same Postgres database as the rest of your
          data. Joining search results with business data is free.
        </li>
        <li>
          Multilingual stemming is enough; you don&apos;t need ML-quality
          synonyms or semantic search.
        </li>
        <li>
          Your scale is under ~100M searchable rows. Past that, FTS
          performance starts to depend heavily on index tuning.
        </li>
      </ul>

      <ArticleH2 id="when-vector-wins">When vector / semantic search wins</ArticleH2>
      <ul>
        <li>
          Users phrase queries naturally (&quot;how do I cancel my
          subscription&quot; vs &quot;cancel&quot;). Vector search captures
          the intent; FTS misses on synonym variation.
        </li>
        <li>
          You&apos;re building a RAG pipeline. Vector retrieval is the
          standard primitive.
        </li>
        <li>
          Your content is essay-length and topical, not name-shaped.
        </li>
      </ul>

      <ArticleH2 id="hybrid">The hybrid pattern</ArticleH2>
      <p>
        The 2026 best practice for any non-trivial search surface: combine
        FTS and vector with reciprocal rank fusion. FTS catches the
        exact-keyword hits; vector catches the semantically-similar ones.
      </p>
      <CodeBlock language="sql" filename="hybrid-rrf.sql">{`-- $1 = query embedding, $2 = query text
WITH lex AS (
  SELECT id, row_number() OVER () AS rk
  FROM posts WHERE search_tsv @@ plainto_tsquery('english', $2)
  ORDER BY ts_rank(search_tsv, plainto_tsquery('english', $2)) DESC
  LIMIT 20
),
vec AS (
  SELECT id, row_number() OVER () AS rk
  FROM posts ORDER BY embedding <=> $1 LIMIT 20
)
SELECT id, sum(1.0/(60+rk)) AS score
FROM (SELECT id, rk FROM lex UNION ALL SELECT id, rk FROM vec) u
GROUP BY id
ORDER BY score DESC LIMIT 10;`}</CodeBlock>
      <p>
        50 lines, one round-trip, both signal types. This pattern beats
        pure FTS on most internal evals and beats pure vector on queries
        with proper nouns.
      </p>

      <ArticleH2 id="setup">Setup that actually works in production</ArticleH2>
      <h3>1. Use a generated column</h3>
      <p>
        Define <code>search_tsv</code> as <code>GENERATED ALWAYS AS</code>{" "}
        instead of writing a trigger. Less code, can&apos;t drift.
      </p>
      <h3>2. Set weights</h3>
      <p>
        Title in weight A, content in B, comments or footer text in C.
        <code>ts_rank</code> respects weights so &quot;the user searched
        for the title&quot; doesn&apos;t get drowned by body matches.
      </p>
      <h3>3. Use <code>plainto_tsquery</code> for user input</h3>
      <p>
        It handles arbitrary text safely. <code>to_tsquery</code> requires
        properly-formatted operator syntax and will throw on user input.
      </p>
      <h3>4. Pick the right language</h3>
      <p>
        <code>'english'</code> is the default; pick yours if different.
        Stop-word and stemming behavior matters more than you&apos;d think
        for relevance.
      </p>

      <ArticleH2 id="performance">Performance budget</ArticleH2>
      <p>For a typical SaaS-shaped corpus on a moderately-sized Postgres:</p>
      <ul>
        <li>Single FTS query against 1M rows: 5-15ms with a GIN index.</li>
        <li>Single FTS query against 100M rows: 30-100ms with a GIN index.</li>
        <li>Hybrid FTS + vector query: 40-120ms total.</li>
      </ul>
      <p>
        If you&apos;re past these numbers, either the GIN index is missing
        or you have an unusual workload (very long documents, very high
        cardinality of distinct terms). External search engines are
        meaningfully faster only past ~500M documents or with tight latency
        SLAs.
      </p>

      <Callout variant="sparkle" title="The 2026 take">
        Most teams don&apos;t need Elasticsearch. They need a GIN index on a
        tsvector column and 50 lines of SQL. Add vector retrieval if your
        queries are natural-language; keep FTS as the lexical signal in a
        hybrid pipeline.
      </Callout>

      <p>
        See <Link href="/blog/pgvector-rag-production">our pgvector
        production guide</Link> for the broader hybrid-search pattern in
        a RAG context.
      </p>
    </>
  );
}
