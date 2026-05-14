import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "pgvector-rag-production",
  title: "pgvector and Postgres for RAG: A 2026 Production Setup",
  description:
    "How to build a production RAG pipeline on Postgres with pgvector in 2026: HNSW indexes, embedding hygiene, chunking strategies, hybrid search, and the failure modes that bite teams in production.",
  publishedAt: "2026-04-29",
  updatedAt: "2026-05-14",
  readingMinutes: 18,
  tags: ["postgres", "pgvector", "rag", "ai"],
  related: ["ai-assisted-database-admin", "jsonb-vs-tables", "supabase-vs-self-hosted-postgres"],
  toc: [
    { id: "why-postgres", label: "Why Postgres + pgvector won 2025" },
    { id: "schema", label: "The schema we actually use" },
    { id: "indexes", label: "HNSW vs IVFFlat, settled" },
    { id: "chunking", label: "Chunking strategy" },
    { id: "embeddings", label: "Embedding hygiene" },
    { id: "hybrid", label: "Hybrid search: vector + lexical" },
    { id: "performance", label: "Performance budgets" },
    { id: "failure-modes", label: "Failure modes we see in production" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Retrieval-Augmented Generation went from research demo to default
        architecture between 2023 and 2026. The question shifted from
        &quot;does it work?&quot; to &quot;what&apos;s the cheapest, simplest,
        most observable way to ship it?&quot;
      </p>

      <p>
        For most teams in 2026, the answer is: Postgres with pgvector and
        HNSW indexes. This is what we&apos;ve learned running RAG pipelines on
        Supabase and Neon over the last 18 months.
      </p>

      <ArticleH2 id="why-postgres">Why Postgres + pgvector won 2025</ArticleH2>

      <p>
        The dedicated vector databases (Pinecone, Qdrant, Weaviate, Milvus)
        are all good products. But for typical RAG workloads — millions, not
        billions, of vectors; sub-200ms query budgets; need to join against
        your business data — the calculus tipped toward Postgres for three
        reasons:
      </p>

      <ol>
        <li>
          <strong>One system to operate.</strong> Your vectors live next to
          your <code>documents</code> and <code>users</code> tables. No data
          sync. No second backup story.
        </li>
        <li>
          <strong>HNSW caught up.</strong> pgvector&apos;s HNSW implementation
          (0.5.0, late 2023) and the subsequent quantisation work in 0.7/0.8
          made the latency gap with the specialised vector DBs irrelevant for
          most workloads.
        </li>
        <li>
          <strong>Joins are the killer feature.</strong> &quot;Give me the top
          5 most-similar chunks <em>that this user is allowed to see and that
          haven&apos;t been deleted</em>&quot; is one SQL query in Postgres.
          In a vector-DB-first architecture, it&apos;s a careful dance.
        </li>
      </ol>

      <ArticleH2 id="schema">The schema we actually use</ArticleH2>

      <p>
        A pattern that has worked across multiple production deploys:
      </p>

      <CodeBlock language="sql" filename="rag-schema.sql">{`CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for hybrid search later.

CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_uri   text NOT NULL,
  title        text NOT NULL,
  tenant_id    uuid NOT NULL,
  -- metadata about provenance, freshness etc.
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL,  -- denormalised for RLS + fast filtering.
  ordinal      int  NOT NULL,  -- position within the document.
  content      text NOT NULL,
  -- 1536-d for OpenAI embeddings, adjust for whatever model you use.
  embedding    vector(1536) NOT NULL,
  token_count  int NOT NULL,
  -- which embedding model produced this. Lets you migrate models gradually.
  model        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chunks_doc_idx     ON chunks (document_id);
CREATE INDEX chunks_tenant_idx  ON chunks (tenant_id);
CREATE INDEX chunks_model_idx   ON chunks (model);

-- HNSW index for the cosine-distance operator.
CREATE INDEX chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- And a GIN trigram index for hybrid lexical search.
CREATE INDEX chunks_content_trgm
  ON chunks USING gin (content gin_trgm_ops);`}</CodeBlock>

      <p>What this design buys you:</p>

      <ul>
        <li>
          <strong>tenant_id denormalised onto chunks</strong>. RLS can filter
          by tenant before the HNSW index is consulted. Without this, the
          planner does the vector search first, then filters — much slower.
        </li>
        <li>
          <strong>model column</strong>. Switching embedding models is the
          single most common Day-2 task. Keeping the model name on every row
          lets you re-embed gradually instead of as a big-bang.
        </li>
        <li>
          <strong>ordinal</strong> for stable chunk order within a document.
          Useful for &quot;show me the chunks before and after this match&quot;.
        </li>
      </ul>

      <ArticleH2 id="indexes">HNSW vs IVFFlat, settled</ArticleH2>

      <p>
        In 2024 there was a real debate. By 2026 it&apos;s closed: HNSW for
        new builds, IVFFlat only for very large corpora (&gt;100M vectors)
        where HNSW&apos;s memory footprint becomes the problem.
      </p>

      <p>The HNSW parameters that matter:</p>

      <ul>
        <li>
          <code>m</code> (default 16) — number of connections per node.
          Higher = better recall, more memory, slower build. 16-32 is the
          right range for most workloads.
        </li>
        <li>
          <code>ef_construction</code> (default 64) — quality of the index
          during build. Higher = better recall, much slower build. 64-200
          for quality-sensitive applications.
        </li>
        <li>
          <code>ef_search</code> — query-time parameter (set per session).
          Higher = better recall, slower query. <code>SET LOCAL hnsw.ef_search
          = 100</code> for the queries where you care about recall.
        </li>
      </ul>

      <Callout variant="tip" title="Build the index after bulk-loading">
        Build the HNSW index <em>after</em> you&apos;ve inserted the initial
        corpus, not before. Otherwise every insert pays the HNSW maintenance
        cost. Use{" "}
        <code>SET maintenance_work_mem = '2GB'</code> on the session that
        builds the index to dramatically speed it up. After the initial load,
        ongoing inserts maintain the index incrementally and are reasonable.
      </Callout>

      <ArticleH2 id="chunking">Chunking strategy</ArticleH2>

      <p>
        Chunking is the place where retrieval quality is won or lost, and
        almost nobody talks about it because it isn&apos;t a model. Three
        rules:
      </p>

      <h3>1. Chunk semantically, not by character count</h3>

      <p>
        Fixed-size 512-token chunks were the 2023 default. By 2026, the better
        approach is structure-aware: split on markdown headings, then on
        paragraphs, with a soft target around 300-500 tokens. The tools to
        do this well (LangChain&apos;s RecursiveCharacterTextSplitter,
        LlamaIndex&apos;s SentenceSplitter with sentence boundaries) are
        commoditised.
      </p>

      <h3>2. Include enough context to be useful in isolation</h3>

      <p>
        A chunk that says &quot;The threshold is 500ms&quot; is useless on its
        own. Prepend a synthesised header — the document title and the
        section&apos;s heading path — to every chunk before embedding it:
      </p>

      <CodeBlock language="ts" filename="enrich-chunk.ts">{`function enrichChunk(doc: Doc, section: Section, body: string): string {
  return [
    doc.title,
    section.headingPath.join(" > "),
    body,
  ].filter(Boolean).join("\\n\\n");
}`}</CodeBlock>

      <p>
        This dramatically improves retrieval quality, especially for technical
        docs. The cost is a few extra tokens per chunk. Worth it.
      </p>

      <h3>3. Overlap matters less than you&apos;d think</h3>

      <p>
        20-token overlap between adjacent chunks used to be conventional
        wisdom. With sentence-aware splitting, we&apos;ve found 0-token
        overlap performs almost identically and saves storage. Test on your
        own corpus before optimising for the overlap value.
      </p>

      <ArticleH2 id="embeddings">Embedding hygiene</ArticleH2>

      <p>The unglamorous operational realities:</p>

      <ul>
        <li>
          <strong>Never mix models.</strong> A cosine-distance comparison
          between embeddings from two different models is mathematically
          meaningless. Filter by the <code>model</code> column.
        </li>
        <li>
          <strong>Re-embedding is a project, not a button.</strong> Plan it as
          a backfill: shadow-write new embeddings into a second column, run
          both indexes for a week, swap.
        </li>
        <li>
          <strong>Cap input length at the model&apos;s recommended limit.</strong>{" "}
          Most embeddings models silently truncate past 8K tokens, but
          truncation usually means the chunk&apos;s &quot;tail&quot; is lost.
          Validate before sending.
        </li>
        <li>
          <strong>Use batch embedding endpoints.</strong> Embedding latency is
          dominated by network round-trips, not compute. The provider&apos;s
          batch API is 5-10x faster per 1000 chunks.
        </li>
      </ul>

      <ArticleH2 id="hybrid">Hybrid search: vector + lexical</ArticleH2>

      <p>
        Pure vector search is great for &quot;find me content about X&quot;.
        It is terrible for queries that include proper nouns, product SKUs,
        or specific identifiers. &quot;Did the docs mention <code>ef_construction</code>
        ?&quot; needs lexical matching, not similarity.
      </p>

      <p>
        The pattern that has won in 2026 is reciprocal rank fusion of vector
        and lexical results. Postgres makes this trivial because the lexical
        side is just a <code>pg_trgm</code> or full-text search:
      </p>

      <CodeBlock language="sql" filename="hybrid-search.sql">{`-- Top-K from vector search.
WITH vector_hits AS (
  SELECT id, 1 - (embedding <=> $1) AS sim, row_number() OVER () AS rk
  FROM chunks
  WHERE tenant_id = $2 AND model = $3
  ORDER BY embedding <=> $1
  LIMIT 20
),
-- Top-K from lexical search.
lex_hits AS (
  SELECT id, similarity(content, $4) AS sim, row_number() OVER () AS rk
  FROM chunks
  WHERE tenant_id = $2 AND content % $4
  ORDER BY similarity(content, $4) DESC
  LIMIT 20
),
-- Reciprocal rank fusion (k=60 is the standard constant).
fused AS (
  SELECT id, sum(1.0 / (60 + rk)) AS score
  FROM (
    SELECT id, rk FROM vector_hits
    UNION ALL
    SELECT id, rk FROM lex_hits
  ) all_hits
  GROUP BY id
)
SELECT c.id, c.content, c.document_id, f.score
FROM fused f
JOIN chunks c ON c.id = f.id
ORDER BY f.score DESC
LIMIT 5;`}</CodeBlock>

      <p>
        $1 is the query embedding, $2 the tenant id, $3 the embedding model
        name, $4 the raw query text. In 50 lines of SQL you have a hybrid
        retrieval pipeline that beats pure vector search on most internal
        evals.
      </p>

      <ArticleH2 id="performance">Performance budgets</ArticleH2>

      <p>For a corpus of 1M-10M chunks with the schema above, on a Supabase Pro / Neon Scale instance:</p>

      <ul>
        <li>Single vector search, top-5, <code>ef_search = 40</code>: <strong>10-30ms</strong>.</li>
        <li>Single vector search, top-20, <code>ef_search = 100</code>: <strong>30-60ms</strong>.</li>
        <li>Hybrid search (query above): <strong>50-100ms</strong>.</li>
        <li>End-to-end RAG with one LLM call: dominated by the LLM, ~600-1500ms.</li>
      </ul>

      <p>
        If you&apos;re past these numbers, the usual culprits are: missing
        tenant_id index, too-large <code>ef_search</code>, or the embedding
        column not being indexed. Check <code>EXPLAIN ANALYZE</code> on the
        query in a SQL playground; the plan should show an HNSW index scan,
        not a sequential scan.
      </p>

      <ArticleH2 id="failure-modes">Failure modes we see in production</ArticleH2>

      <h3>1. Re-indexing during peak traffic</h3>

      <p>
        Rebuilding an HNSW index over a multi-million-row corpus can take 15
        minutes to an hour and consumes IO + CPU. Schedule it during low
        traffic; use <code>CREATE INDEX CONCURRENTLY</code> to avoid blocking
        writes.
      </p>

      <h3>2. The chunk-table fragmentation problem</h3>

      <p>
        High-churn corpora (think: customer chat logs continuously rewritten
        as conversations evolve) cause heavy bloat on the chunks table.{" "}
        <code>VACUUM FULL</code> is not viable in production; instead, ensure
        autovacuum is tuned for the table&apos;s update rate, and consider
        partitioning by month.
      </p>

      <h3>3. The wrong distance metric</h3>

      <p>
        OpenAI embeddings are normalised, so <code>vector_cosine_ops</code>{" "}
        and <code>vector_inner_product_ops</code> give identical orderings.
        Cohere and Voyage are also normalised. Some open-weight models are
        not; for those you need to L2-normalise before insert or use{" "}
        <code>vector_l2_ops</code> with a different opclass on the index.
        Check the model card.
      </p>

      <h3>4. Cost surprises from embeddings</h3>

      <p>
        Embedding millions of chunks is cheap per row, expensive in aggregate.
        Track total tokens embedded as a first-class metric. For Suparbase
        users, our{" "}
        <Link href="/features">AI chat</Link> shows per-conversation token
        usage; for embeddings, you&apos;ll want a custom counter.
      </p>

      <p>
        Once you have these four shapes covered, RAG on Postgres is one of
        the calmer parts of your stack. The complicated parts are upstream
        (chunking, prompts) and downstream (eval); the database is reliably
        boring, which is what you want.
      </p>
    </>
  );
}
