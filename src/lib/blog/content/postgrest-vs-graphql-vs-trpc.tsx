import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "postgrest-vs-graphql-vs-trpc",
  title: "PostgREST vs GraphQL vs tRPC in 2026",
  description:
    "Three flavors of 'API on top of your database' and how to pick. Honest 2026 comparison of PostgREST, GraphQL, and tRPC, with the AI-paired angle baked in.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["api", "postgrest", "graphql", "trpc"],
  related: ["why-supabase-for-ai-agents", "type-safe-database-for-ai-paired-code", "cursor-plus-supabase-2026"],
  toc: [
    { id: "what-each-is", label: "What each one actually is" },
    { id: "postgrest", label: "PostgREST" },
    { id: "graphql", label: "GraphQL" },
    { id: "trpc", label: "tRPC" },
    { id: "decision", label: "How to decide" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        The eternal &quot;which API layer&quot; question. PostgREST gives you
        a REST API by introspecting your database. GraphQL gives you a
        schema-driven query language with deep client tooling. tRPC gives
        you typed RPC over HTTP with zero schema language. By 2026 all
        three have settled into roles where they win cleanly.
      </p>

      <ArticleH2 id="what-each-is">What each one actually is</ArticleH2>
      <ul>
        <li>
          <strong>PostgREST</strong>: a small server that exposes your
          Postgres schema as a REST API. URL paths map to tables. RLS does
          the authz. Zero application code.
        </li>
        <li>
          <strong>GraphQL</strong>: a query language + a typed schema you
          maintain. Clients ask for exactly the fields they need; one HTTP
          endpoint serves all queries.
        </li>
        <li>
          <strong>tRPC</strong>: typed RPC procedures in TypeScript. The
          client imports the server&apos;s types directly; calls are
          end-to-end type-safe. No schema language, no codegen.
        </li>
      </ul>

      <ArticleH2 id="postgrest">PostgREST</ArticleH2>
      <p>
        The default when you&apos;re on Supabase. It&apos;s already there;
        every Supabase project exposes its schema as REST out of the box.
      </p>
      <CodeBlock language="bash">{`GET /rest/v1/posts?select=id,title&status=eq.published&order=created_at.desc&limit=10
# Returns published posts. RLS evaluated server-side.`}</CodeBlock>
      <p>
        <strong>Wins</strong>: zero server code; OpenAPI doc generated
        automatically; RLS-native authz; perfect for AI agents that can
        read the introspection.
      </p>
      <p>
        <strong>Trade-offs</strong>: the API shape mirrors your schema, so
        a poor schema produces a poor API; complex business logic still
        needs a real server somewhere.
      </p>

      <ArticleH2 id="graphql">GraphQL</ArticleH2>
      <p>
        The right choice when you have many client teams (web, mobile, third
        parties) with different field needs against the same data, or a
        large existing schema you want a polished query interface for.
      </p>
      <p>
        <strong>Wins</strong>: client-side query flexibility; mature tooling
        (Apollo, Relay, urql); excellent federation story for microservices.
      </p>
      <p>
        <strong>Trade-offs</strong>: a schema you maintain alongside your
        database schema. Resolvers are server code. N+1 query problems are
        a constant maintenance concern (dataloaders solve, but only if
        wired up).
      </p>

      <ArticleH2 id="trpc">tRPC</ArticleH2>
      <p>
        TypeScript end-to-end. Define procedures on the server; import them
        as functions on the client. Types flow without any schema language.
      </p>
      <CodeBlock language="ts" filename="server.ts">{`export const appRouter = router({
  posts: router({
    list: publicProcedure
      .input(z.object({ status: z.enum(["draft","published"]).optional() }))
      .query(async ({ input }) => {
        return db.select().from(posts)
          .where(input.status ? eq(posts.status, input.status) : undefined);
      }),
  }),
});`}</CodeBlock>
      <CodeBlock language="ts" filename="client.ts">{`const data = await trpc.posts.list.query({ status: "published" });
// data is fully typed: Post[]`}</CodeBlock>
      <p>
        <strong>Wins</strong>: end-to-end type safety without codegen;
        delightful DX for TypeScript-first teams; perfect for AI-paired
        coding because every call is a typed function.
      </p>
      <p>
        <strong>Trade-offs</strong>: TypeScript-only client/server. Not the
        right call when non-TS clients (mobile native, third-party
        integrations) need to consume the same API.
      </p>

      <ArticleH2 id="decision">How to decide</ArticleH2>
      <ul>
        <li>
          <strong>You&apos;re on Supabase and shipping a TypeScript-only
          frontend</strong>: PostgREST is already there. Use it for the 80%
          and add tRPC for the 20% of business logic that doesn&apos;t fit
          REST.
        </li>
        <li>
          <strong>You have multiple client surfaces (web + iOS + Android
          + partners)</strong>: GraphQL pays for itself.
        </li>
        <li>
          <strong>You&apos;re a small team shipping a TS-only product fast</strong>:
          tRPC. Minimum overhead, maximum type safety.
        </li>
        <li>
          <strong>You&apos;re a public API for third parties</strong>:
          REST (handwritten or PostgREST-derived). Third-party developers
          expect REST.
        </li>
      </ul>

      <Callout variant="tip" title="The hybrid is fine">
        Plenty of teams in 2026 use PostgREST for the obvious CRUD (auto-
        generated, RLS-protected) and tRPC for business-logic-heavy paths
        (custom workflows, complex authorization). The two coexist
        cleanly. Pick one as the default; reach for the other when the
        first doesn&apos;t fit.
      </Callout>

      <p>
        For AI-paired projects specifically, the type-safe options
        (PostgREST + introspection, tRPC) win. The agent reads types;
        types describe the API; the agent writes correct callers. GraphQL
        works but the second schema layer is more for the agent to
        synchronise.
      </p>
    </>
  );
}
