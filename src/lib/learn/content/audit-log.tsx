export const meta = {
  slug: "audit-log",
  term: "Audit Log",
  description:
    "An append-only table that records every meaningful write to your database: who, when, what, with before/after snapshots when available. The forensic record you need before you need it.",
  category: "Patterns" as const,
  related: [
    { kind: "blog" as const, slug: "when-ai-shouldnt-touch-your-database", label: "When AI shouldn't write directly" },
    { kind: "blog" as const, slug: "ai-assisted-database-admin", label: "AI-assisted database admin" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        An <strong>audit log</strong> is an append-only table that records
        every meaningful write to your database. Each row carries: the
        user, the connection, the table, the primary key, the verb (insert
        / update / delete), the HTTP status, and ideally a snapshot of the
        row before and after the change.
      </p>
      <p>
        Why bother: when something goes wrong, you want to answer "who or
        what changed this, when, and what did it look like before?" without
        spelunking application logs. For AI-paired teams, the audit log is
        also how you know whether a change was human-initiated or agent-
        initiated.
      </p>
      <p>
        2026 best practice: the audit log lives in Postgres next to the
        business data. Writes go through a single helper that captures the
        row. RLS is on; only the owner can read their entries. For
        compliance-tagged workloads, retain the log indefinitely; for
        operational use, 90 days is usually enough.
      </p>
    </>
  );
}
