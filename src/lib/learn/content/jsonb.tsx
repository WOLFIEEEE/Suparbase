export const meta = {
  slug: "jsonb",
  term: "JSONB",
  description:
    "JSONB is Postgres's binary JSON column type. It stores structured data with indexing, operator support, and decent performance, blurring the line between relational and document stores.",
  category: "Postgres" as const,
  related: [
    { kind: "blog" as const, slug: "jsonb-vs-tables", label: "JSONB vs tables: a decision framework" },
    { kind: "compare" as const, slug: "postgres-vs-mongodb", label: "Postgres vs MongoDB" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>JSONB</strong> is Postgres&apos;s binary JSON column type
        (added in 9.4). Unlike the text-based <code>json</code> type, JSONB
        parses, normalises, and indexes JSON at insert time. It supports
        rich operators (<code>-&gt;&gt;</code>, <code>@&gt;</code>,{" "}
        <code>?</code>), can be indexed with GIN, and is the standard answer
        for "I need flexible-shape data inside Postgres".
      </p>
      <p>
        Use cases: provider-variable webhook payloads, user-defined
        metadata, sparse columns where promoting them all to first-class
        columns would create wide sparse tables. The 2026 best practice is
        "promote on demand" - start in JSONB, move a key to a real
        column the first time you filter on it.
      </p>
      <p>
        JSONB does not enforce types or shape. If you need that, pair it
        with a CHECK constraint or a validator at the application layer.
      </p>
    </>
  );
}
