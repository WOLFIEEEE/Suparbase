export const meta = {
  slug: "postgrest",
  term: "PostgREST",
  description:
    "PostgREST is a small server that introspects a Postgres schema and exposes a REST API. The engine that powers Supabase's database API. Zero application code.",
  category: "Supabase" as const,
  related: [
    { kind: "blog" as const, slug: "postgrest-vs-graphql-vs-trpc", label: "PostgREST vs GraphQL vs tRPC" },
    { kind: "blog" as const, slug: "why-supabase-for-ai-agents", label: "Why Supabase for AI agents" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>PostgREST</strong> is a server (originally Haskell, now
        with Rust experiments) that introspects a Postgres schema and
        exposes a standards-conformant REST API automatically. URLs map
        to tables: <code>GET /rest/v1/posts?status=eq.published</code>{" "}
        is a typed, RLS-protected query.
      </p>
      <p>
        Why it matters: PostgREST is what makes Supabase work. The
        client SDK isn&apos;t a custom protocol; it&apos;s HTTP requests
        against PostgREST. Authentication is via JWT; PostgREST forwards
        the claims into Postgres GUCs so RLS can evaluate per-row
        authorization.
      </p>
      <p>
        For AI agents, PostgREST is the cleanest schema-to-API surface in
        the industry. <code>GET /rest/v1/</code> returns an OpenAPI
        document describing every table, column, type, and foreign key.
        One HTTP call, full schema, no driver-specific quirks.
      </p>
    </>
  );
}
