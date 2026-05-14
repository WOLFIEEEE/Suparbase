export const meta = {
  slug: "mvcc",
  term: "MVCC (Multi-Version Concurrency Control)",
  description:
    "MVCC is Postgres's concurrency model. Every row is a chain of versions; readers don't block writers; writers don't block readers. The cost: bloat from long transactions.",
  category: "Postgres" as const,
  related: [
    { kind: "blog" as const, slug: "postgres-mvcc-when-it-bites", label: "When MVCC bites you" },
    { kind: "blog" as const, slug: "postgres-observability-stack-2026", label: "Observability stack" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>Multi-Version Concurrency Control</strong> is Postgres&apos;s
        approach to concurrent reads and writes. Every row is a chain of
        versions; UPDATE writes a new version and marks the old one as
        "invisible after transaction X". Each running transaction sees a
        consistent snapshot of the database without locking out other
        sessions.
      </p>
      <p>
        Benefits: readers don&apos;t block writers, writers don&apos;t
        block readers, strong consistency without coarse locking. Cost:
        old row versions accumulate as bloat until <code>VACUUM</code>{" "}
        (manual or autovacuum) reclaims them. A long-running transaction
        keeps old versions alive for the entire database, which is the
        source of most "why is this table 200 GB now" mysteries.
      </p>
    </>
  );
}
