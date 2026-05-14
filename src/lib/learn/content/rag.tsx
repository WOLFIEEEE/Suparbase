export const meta = {
  slug: "rag",
  term: "RAG (Retrieval-Augmented Generation)",
  description:
    "RAG combines a vector search step with an LLM generation step. Retrieve relevant chunks; pass them to the model as context; generate the answer. The standard pattern for grounded LLM apps in 2026.",
  category: "AI" as const,
  related: [
    { kind: "blog" as const, slug: "pgvector-rag-production", label: "pgvector RAG in production" },
    { kind: "guide" as const, slug: "first-rag-app-with-pgvector", label: "Build your first RAG app" },
    { kind: "blog" as const, slug: "vector-databases-ranked-2026", label: "Vector databases ranked" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>RAG</strong> is the architectural pattern for grounding LLM
        responses in your own data. The pipeline has three stages:
      </p>
      <ol>
        <li><strong>Ingest</strong>: split documents into chunks, embed each chunk into a vector, store.</li>
        <li><strong>Retrieve</strong>: embed the user&apos;s query; find the top-K most similar chunks.</li>
        <li><strong>Generate</strong>: pass the retrieved chunks to an LLM as context; produce the answer.</li>
      </ol>
      <p>
        Why RAG: LLMs don&apos;t know your private data, and they hallucinate
        when they have to guess. Retrieval grounds the model in actual,
        attributable content; the model&apos;s job becomes "summarise and
        cite", not "remember the answer".
      </p>
      <p>
        2026 best practice combines vector similarity with lexical
        (full-text) search via reciprocal rank fusion, since neither
        signal alone catches every relevant chunk.
      </p>
    </>
  );
}
