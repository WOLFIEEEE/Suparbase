export const meta = {
  slug: "rls",
  term: "Row-Level Security (RLS)",
  description:
    "Row-Level Security is a Postgres feature that lets you attach per-row policies to a table. Queries automatically filter rows based on the caller's identity.",
  category: "Postgres" as const,
  related: [
    { kind: "blog" as const, slug: "row-level-security-postgres-2026", label: "Practical RLS guide" },
    { kind: "guide" as const, slug: "add-rls-to-existing-database", label: "Add RLS without breaking production" },
    { kind: "blog" as const, slug: "multi-tenant-saas-postgres", label: "Multi-tenant SaaS on Postgres" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>Row-Level Security</strong> (RLS) is a Postgres feature
        introduced in 9.5 that attaches policies to a table. Each policy is
        a SQL expression returning boolean. Postgres evaluates the policy
        on every SELECT, INSERT, UPDATE, or DELETE; rows that fail are
        invisible to the caller.
      </p>
      <p>
        On Supabase, RLS is the primary authorization layer. PostgREST
        forwards the caller&apos;s JWT claims into Postgres GUCs
        (<code>request.jwt.claims</code>); policies read those claims via
        helpers like <code>auth.uid()</code>. The database itself decides
        what the user can see and do.
      </p>
      <p>
        Two switches enable RLS per table:{" "}
        <code>ALTER TABLE ... ENABLE ROW LEVEL SECURITY</code> and at least
        one <code>CREATE POLICY</code>. Without policies, RLS denies
        everything &mdash; default-deny is the safe behaviour but a common
        cause of "my reads stopped working".
      </p>
    </>
  );
}
