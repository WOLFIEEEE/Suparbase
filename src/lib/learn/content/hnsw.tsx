export const meta = {
  slug: "hnsw",
  term: "HNSW (Hierarchical Navigable Small Worlds)",
  description:
    "HNSW is an approximate-nearest-neighbour index used by every major vector database. Great recall, fast queries, larger memory footprint than alternatives.",
  category: "AI" as const,
  related: [
    { kind: "blog" as const, slug: "pgvector-rag-production", label: "pgvector RAG production guide" },
    { kind: "blog" as const, slug: "vector-databases-ranked-2026", label: "Vector databases ranked" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>HNSW</strong> is an approximate-nearest-neighbour algorithm.
        It builds a multi-layer graph where each node points to its nearest
        neighbours; queries traverse the graph greedily to find a high-
        quality top-K in logarithmic time.
      </p>
      <p>
        By 2026, HNSW is the default index type in every credible vector
        database: pgvector, Qdrant, Pinecone, Weaviate, Milvus. The main
        parameters are <code>m</code> (neighbours per node, default 16) and{" "}
        <code>ef_construction</code> (build quality, default 64). Higher
        values give better recall at higher build cost. Query-time tuning
        via <code>ef_search</code> trades recall for latency.
      </p>
      <p>
        Memory footprint matters: HNSW stores the graph in RAM for fast
        traversal. Past ~100M vectors, memory becomes the constraint and
        IVFFlat or quantised variants start to be worth it.
      </p>
    </>
  );
}
