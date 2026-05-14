import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "pgvector-vs-pinecone",
  leftName: "pgvector",
  rightName: "Pinecone",
  title: "pgvector vs Pinecone in 2026",
  description:
    "The vector DB comparison that actually matters in 2026: Postgres + pgvector vs the dedicated managed service. Where each one wins and what the gap really looks like.",
  tldr:
    "pgvector lives next to your business data and wins for almost every workload up to 100M vectors. Pinecone earns its keep for billion-scale or when you want zero database operations. For most teams, the bundled-with-Postgres model is the calmer pick.",
  callouts: [
    { context: "Sub-100M vectors", winner: "pgvector" },
    { context: "Billion-scale, big budget", winner: "Pinecone" },
    { context: "Joins with business data", winner: "pgvector" },
    { context: "Zero database ops", winner: "Pinecone" },
  ],
  matrix: [
    { feature: "Hosting model", left: "Extension in your Postgres", right: "Managed SaaS only" },
    { feature: "Index type", left: "HNSW (default), IVFFlat", right: "HNSW-based proprietary" },
    { feature: "Hybrid search", left: "RRF over vector + lexical SQL", right: "Built-in sparse + dense" },
    { feature: "Joins with tables", left: "First-class (same SQL)", right: "Not possible (separate system)" },
    { feature: "Authz / RLS", left: "Postgres RLS works", right: "API-key + namespace separation" },
    { feature: "Pricing", left: "Existing Postgres compute", right: "Per-vector / per-query" },
    { feature: "Quantisation", left: "PQ in 0.7+, halfvec / bit", right: "Proprietary; on by default" },
    { feature: "Scale ceiling", left: "Tens to hundreds of millions", right: "Billions" },
    { feature: "Operational footprint", left: "Same as Postgres", right: "Zero, fully managed" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-pgvector-wins">When pgvector wins</ArticleH2>
      <ul>
        <li>
          Your vectors are part of a larger application that already lives in Postgres. Joining a top-K
          vector search with a users table or a tenant filter is one SQL query.
        </li>
        <li>
          You want RLS to apply to your vector search the same way it applies to the rest of your data.
        </li>
        <li>
          Your scale is under ~100M vectors. HNSW on a well-sized Postgres handles this with latency
          comparable to Pinecone&apos;s serverless tier.
        </li>
        <li>
          You don&apos;t want a second cloud bill or a second monitoring story.
        </li>
      </ul>

      <ArticleH2 id="when-pinecone-wins">When Pinecone wins</ArticleH2>
      <ul>
        <li>
          You&apos;re at billion-vector scale. Pinecone&apos;s proprietary indexing and multi-region
          serverless were built for this.
        </li>
        <li>
          You don&apos;t want to operate a database at all. Pinecone is the most hands-off of the vector
          stores.
        </li>
        <li>
          You have an enterprise procurement process that prefers a dedicated SaaS vendor.
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        The 2026 default for production RAG is pgvector. It hit feature parity with the dedicated vector
        stores in 2024, and the join-with-business-data advantage compounds as your application grows.
        Pinecone is still a great product; it&apos;s sized for a workload (billions of vectors, zero
        database ops, enterprise pricing) that most teams don&apos;t actually have. If you do have that
        workload, Pinecone is the safer pick; otherwise, you&apos;re paying for capacity you won&apos;t use.
      </p>
    </>
  );
}
