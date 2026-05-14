export const meta = {
  slug: "pgvector",
  term: "pgvector",
  description:
    "pgvector is the Postgres extension that adds a vector data type, distance operators, and HNSW indexing. The 2026 default for production RAG inside the database you already run.",
  category: "Postgres" as const,
  related: [
    { kind: "blog" as const, slug: "pgvector-rag-production", label: "pgvector in production" },
    { kind: "compare" as const, slug: "pgvector-vs-pinecone", label: "pgvector vs Pinecone" },
    { kind: "guide" as const, slug: "first-rag-app-with-pgvector", label: "Build your first RAG app" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>pgvector</strong> is a Postgres extension that adds the{" "}
        <code>vector</code> data type, distance operators (cosine
        similarity <code>&lt;=&gt;</code>, L2 distance <code>&lt;-&gt;</code>,
        inner product <code>&lt;#&gt;</code>), and indexing strategies
        (IVFFlat from day one, HNSW from 0.5).
      </p>
      <p>
        Why it matters: vector search no longer needs a second database.
        Your RAG embeddings sit next to your business data; joins between
        a top-K vector search and a tenant filter are one SQL query.
        Performance reached parity with dedicated vector DBs around 2024,
        and the operational simplicity hasn&apos;t been matched.
      </p>
      <p>
        Enable it on Supabase with <code>CREATE EXTENSION vector;</code> or
        through the Studio Extensions panel. The same syntax works on Neon,
        RDS, and self-hosted Postgres 14+.
      </p>
    </>
  );
}
