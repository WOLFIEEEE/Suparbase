import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "first-rag-app-with-pgvector",
  title: "Build Your First RAG App with Postgres + pgvector",
  description:
    "End-to-end tutorial: enable pgvector, design the schema, ingest documents, embed them, run hybrid search, and integrate with your LLM. All on Postgres, all in one afternoon.",
  level: "Intermediate" as const,
  readingMinutes: 14,
  timeMinutes: 90,
  tags: ["pgvector", "rag", "ai", "postgres"],
  steps: [
    { id: "step-1", title: "Enable pgvector" },
    { id: "step-2", title: "Design the schema" },
    { id: "step-3", title: "Ingest + chunk a document" },
    { id: "step-4", title: "Embed and store" },
    { id: "step-5", title: "Query: hybrid search" },
    { id: "step-6", title: "Plug into your LLM" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        Ninety minutes from blank Supabase project to working RAG with hybrid
        search. We&apos;ll use OpenAI&apos;s embedding model by default; substitute
        any other provider with the same shape.
      </p>

      <ArticleH2 id="step-1">Step 1: Enable pgvector</ArticleH2>
      <p>
        In Supabase Studio, go to Database → Extensions, find{" "}
        <code>pgvector</code>, and enable it. Or run:
      </p>
      <CodeBlock language="sql">{`CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for lexical hybrid search`}</CodeBlock>

      <ArticleH2 id="step-2">Step 2: Design the schema</ArticleH2>
      <CodeBlock language="sql" filename="schema.sql">{`CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  source_uri   text NOT NULL,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL,    -- denormalised for RLS + filter speed
  ordinal      int  NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536) NOT NULL,
  model        text NOT NULL,   -- which embedding model produced this
  token_count  int  NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chunks_tenant_idx ON chunks (tenant_id);
CREATE INDEX chunks_doc_idx    ON chunks (document_id);

-- HNSW index for vector similarity
CREATE INDEX chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Trigram GIN for lexical hybrid
CREATE INDEX chunks_content_trgm
  ON chunks USING gin (content gin_trgm_ops);`}</CodeBlock>
      <Callout variant="tip" title="Pick the embedding dimension">
        The schema above assumes OpenAI&apos;s 1536-dim embeddings. If you use
        a different model, change <code>vector(1536)</code> to match.
      </Callout>

      <ArticleH2 id="step-3">Step 3: Ingest + chunk a document</ArticleH2>
      <p>
        Sentence-aware chunking with header enrichment is the pattern that
        works in 2026. Quick TypeScript version:
      </p>
      <CodeBlock language="ts" filename="ingest.ts">{`import { readFile } from "node:fs/promises";

interface Chunk {
  ordinal: number;
  content: string;
  tokenCount: number;
}

function chunkMarkdown(md: string, title: string): Chunk[] {
  // Naive but effective: split on headings, then on paragraphs.
  const sections = md.split(/^##\\s+/m);
  const out: Chunk[] = [];
  let ordinal = 0;
  for (const sec of sections) {
    const lines = sec.split("\\n").filter(Boolean);
    const heading = lines.shift() ?? "";
    const body = lines.join(" ").trim();
    if (!body) continue;
    // Approximate tokens by chars / 4
    out.push({
      ordinal: ordinal++,
      content: \`\${title}\\n\${heading}\\n\\n\${body}\`,
      tokenCount: Math.ceil(body.length / 4),
    });
  }
  return out;
}`}</CodeBlock>

      <ArticleH2 id="step-4">Step 4: Embed and store</ArticleH2>
      <CodeBlock language="ts" filename="embed-and-store.ts">{`import OpenAI from "openai";
import { db } from "@/db/client";
import { chunks, documents } from "@/db/schema";

const openai = new OpenAI();

async function embedAndStore(
  tenantId: string,
  title: string,
  sourceUri: string,
  chunked: Chunk[],
) {
  const [doc] = await db
    .insert(documents)
    .values({ tenantId, title, sourceUri })
    .returning();

  // Batch embed (5-10x faster than per-row)
  const inputs = chunked.map((c) => c.content);
  const resp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs,
  });

  await db.insert(chunks).values(
    chunked.map((c, i) => ({
      documentId:  doc.id,
      tenantId,
      ordinal:     c.ordinal,
      content:     c.content,
      embedding:   resp.data[i].embedding,
      model:       "text-embedding-3-small",
      tokenCount:  c.tokenCount,
    })),
  );
}`}</CodeBlock>

      <ArticleH2 id="step-5">Step 5: Query: hybrid search</ArticleH2>
      <p>
        Pure vector search misses queries that include proper nouns. Hybrid
        search (vector + lexical, fused by reciprocal rank) is what you want.
      </p>
      <CodeBlock language="sql" filename="search.sql">{`-- $1 = query embedding, $2 = tenant_id, $3 = model name, $4 = query text
WITH vector_hits AS (
  SELECT id, row_number() OVER () AS rk
  FROM chunks
  WHERE tenant_id = $2 AND model = $3
  ORDER BY embedding <=> $1
  LIMIT 20
),
lex_hits AS (
  SELECT id, row_number() OVER () AS rk
  FROM chunks
  WHERE tenant_id = $2 AND content % $4
  ORDER BY similarity(content, $4) DESC
  LIMIT 20
),
fused AS (
  SELECT id, sum(1.0 / (60 + rk)) AS score
  FROM (
    SELECT id, rk FROM vector_hits
    UNION ALL
    SELECT id, rk FROM lex_hits
  ) all_hits
  GROUP BY id
)
SELECT c.id, c.content, f.score
FROM fused f
JOIN chunks c ON c.id = f.id
ORDER BY f.score DESC
LIMIT 5;`}</CodeBlock>

      <ArticleH2 id="step-6">Step 6: Plug into your LLM</ArticleH2>
      <CodeBlock language="ts" filename="rag.ts">{`import OpenAI from "openai";
const openai = new OpenAI();

export async function answer(question: string, tenantId: string) {
  const [embedding] = (await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [question],
  })).data;

  const hits = await db.execute<{ content: string }>(/* the SQL above */ );

  const context = hits.map((h) => h.content).join("\\n---\\n");
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Answer using only the context. Cite chunk numbers." },
      { role: "user",   content: \`Context:\\n\${context}\\n\\nQuestion: \${question}\` },
    ],
  });
  return completion.choices[0].message.content;
}`}</CodeBlock>

      <Callout variant="sparkle" title="That's a RAG app">
        Schema, ingest, hybrid search, LLM call. Total: under 200 lines of
        code and 90 minutes. For deeper coverage, see our{" "}
        <Link href="/blog/pgvector-rag-production">pgvector production guide</Link>{" "}
        for capacity planning, re-embedding strategies, and the failure
        modes that bite at scale.
      </Callout>
    </>
  );
}
