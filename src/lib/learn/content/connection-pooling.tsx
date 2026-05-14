export const meta = {
  slug: "connection-pooling",
  term: "Connection Pooling",
  description:
    "A pooler fronts Postgres with a smaller set of upstream connections, multiplexing many client connections over them. Essential for serverless and high-concurrency workloads.",
  category: "Postgres" as const,
  related: [
    { kind: "blog" as const, slug: "postgres-connection-pooling-2026", label: "Connection pooling deep dive" },
    { kind: "blog" as const, slug: "multi-tenant-saas-postgres", label: "Multi-tenant Postgres" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>Connection pooling</strong> sits between your application
        and Postgres. The pooler holds a small set of upstream connections
        and multiplexes many client connections over them. Without a
        pooler, every serverless request would open a fresh Postgres
        connection &mdash; expensive (~10MB per connection) and quickly
        exhausts the default <code>max_connections</code> limit of 100.
      </p>
      <p>
        Three modes:{" "}
        <strong>session</strong> (one client gets one upstream for the whole
        connection),{" "}
        <strong>transaction</strong> (one upstream per transaction; the
        scaling win), and{" "}
        <strong>statement</strong> (one per statement, almost nobody uses).
      </p>
      <p>
        2026 popular poolers: pgBouncer (rock-solid C, single-threaded),
        Supavisor (Elixir, multi-tenant, Supabase&apos;s default), PgCat
        (Rust, multi-threaded, supports read replica routing), RDS Proxy
        (AWS-bundled). Pick transaction mode for serverless; watch out
        for prepared-statement compatibility in your driver.
      </p>
    </>
  );
}
