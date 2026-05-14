import Link from "next/link";
import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "which-database-for-vibe-coding-2026",
  title: "Which Database for a Vibe-Coded Project in 2026?",
  description:
    "A practical decision guide for picking a database when an AI agent is writing most of your code. Covers Postgres, Supabase, Neon, Turso, MongoDB, PlanetScale, and Convex, with the trade-offs that actually matter in 2026.",
  publishedAt: "2026-05-13",
  updatedAt: "2026-05-14",
  readingMinutes: 13,
  tags: ["vibe-coding", "databases", "decision-guide"],
  related: ["best-ai-friendly-database-2026", "supabase-vs-self-hosted-postgres", "mongodb-vs-postgres-2026"],
  toc: [
    { id: "what-is-vibe-coding", label: "What we mean by vibe-coded" },
    { id: "what-changes", label: "What the AI changes" },
    { id: "decision-axes", label: "The four axes that actually matter" },
    { id: "the-shortlist", label: "The shortlist in 2026" },
    { id: "recommendation", label: "A flowchart, sort of" },
    { id: "anti-patterns", label: "Anti-patterns we keep seeing" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        It&apos;s May 2026. You&apos;re starting a new project. You&apos;re
        going to spend more time describing what you want to your editor than
        typing yourself. Which database should you pick?
      </p>

      <p>
        The answer used to be &quot;Postgres, unless you have a reason&quot;
        and that&apos;s still 80% correct. But what&apos;s changed in the
        vibe-coded era is the <em>tax</em> on each option: how much your AI
        assistant fights you when it&apos;s navigating that database&apos;s
        schema, generating queries, or writing migrations. That tax now
        matters more than peak QPS or the cool feature on the marketing
        page.
      </p>

      <ArticleH2 id="what-is-vibe-coding">What we mean by &quot;vibe-coded&quot;</ArticleH2>

      <p>
        We use the term in the original sense: you&apos;re building software
        primarily by talking to an AI coding agent (Cursor, Windsurf, Claude
        Code, Codex), describing the change you want, reviewing the diff,
        and shipping. You still understand the architecture. The AI does
        the typing.
      </p>

      <p>
        For databases specifically, this means the agent is the one writing:
      </p>

      <ul>
        <li>Schema migrations.</li>
        <li>Query helpers and ORM models.</li>
        <li>Most of your auth + authorization logic.</li>
        <li>Test data fixtures.</li>
        <li>Sometimes ad-hoc analytical queries you run once.</li>
      </ul>

      <p>
        Your job is to set up a database that gives the agent enough
        scaffolding to do all of the above without drifting.
      </p>

      <ArticleH2 id="what-changes">What the AI changes</ArticleH2>

      <p>The 2026 calculus moves on three things:</p>

      <h3>1. Schema discoverability beats raw performance</h3>

      <p>
        If the agent can introspect your database in one tool call and get
        an accurate picture (table names, columns, types, foreign keys), it
        produces good queries. If it has to guess from your code, it
        fabricates. Databases with first-class introspection (Postgres,
        SQLite) are massively favored over those where the agent has to
        infer (MongoDB, untyped key-value stores).
      </p>

      <h3>2. Type generation is non-negotiable</h3>

      <p>
        The agent works much better when it can see a typed schema as code.
        That means Drizzle, Prisma, or sqlc-generated types in your project.
        Databases with mature type-generation tooling have a real moat in
        the vibe-coded world.
      </p>

      <h3>3. &quot;It just works in a serverless function&quot; matters more</h3>

      <p>
        The agent doesn&apos;t care how connection pooling works. It will
        cheerfully open a connection per request. Pick a database where
        that&apos;s not catastrophic: serverless drivers (Neon), edge-aware
        SDKs (Turso), or a built-in transaction-mode pooler (Supabase
        Supavisor).
      </p>

      <ArticleH2 id="decision-axes">The four axes that actually matter</ArticleH2>

      <p>
        Ignore feature checklists. The four axes that decide whether your
        vibe-coded project ships or stalls:
      </p>

      <ol>
        <li>
          <strong>Schema is queryable by the AI</strong>: Postgres, SQLite
          (high). MongoDB (medium; collections + dynamic shape). KV stores
          (low).
        </li>
        <li>
          <strong>Typed clients exist for your language</strong>: TS/JS,
          mostly all of them. Other languages, narrower. Python has SQLAlchemy
          + Pydantic models for Postgres, less complete elsewhere.
        </li>
        <li>
          <strong>Local dev is one command</strong>: Docker, embedded SQLite,
          or a hosted free tier. If &quot;start the database&quot; is a tutorial,
          the agent will skip it and your project drifts.
        </li>
        <li>
          <strong>The migration story is sane</strong>: Drizzle / Prisma /
          Atlas can write a migration. The CLI can apply it. The agent can
          re-run it.
        </li>
      </ol>

      <ArticleH2 id="the-shortlist">The shortlist in 2026</ArticleH2>

      <h3>Supabase (managed Postgres + bundled services)</h3>

      <p>
        Default pick for solo founders and small teams. Postgres
        introspection via PostgREST is the cleanest in the industry; the AI
        agent can list tables, columns, and FKs without writing custom
        tooling. RLS doubles as your authorization layer. Bundled auth,
        storage, and realtime mean you skip three more decisions. Free tier
        is genuinely usable.
      </p>

      <p>
        Watch for: the platform&apos;s opinions on extensions (allow-list),
        and the fact that PostgREST&apos;s URL shape is the API you&apos;re
        committing to. Both are fine; both are worth knowing about going in.
      </p>

      <h3>Neon (managed Postgres, branching-first)</h3>

      <p>
        The DB-side equivalent of GitHub branches. Every preview environment
        gets its own database fork. For vibe-coded projects that ship many
        PRs per week, this is a quietly transformative feature. Pair with
        Drizzle or Prisma + your auth provider of choice.
      </p>

      <h3>Turso / libSQL (SQLite-at-the-edge)</h3>

      <p>
        If your project is single-tenant or per-user-database (think:
        notes apps, personal CRMs, agent-per-user products), Turso&apos;s
        approach of giving each user a tiny SQLite database is genuinely
        unique. The agent loves SQLite because every developer&apos;s
        editor already understands it. The catch: limited write
        concurrency per database, no foreign-key cascades in some
        configurations.
      </p>

      <h3>Cloudflare D1</h3>

      <p>
        SQLite on Cloudflare&apos;s edge. Tight integration with Workers
        means cold-start latency is essentially gone. Good for projects
        you&apos;re shipping on the Cloudflare stack anyway. Less compelling
        if you&apos;re also on Vercel or AWS.
      </p>

      <h3>MongoDB Atlas</h3>

      <p>
        Wins in a narrow band of use cases (genuinely document-shaped data;
        polymorphic records that don&apos;t fit relational shape; large
        embedded arrays that don&apos;t want to be a separate table). The
        agent does fine writing aggregation pipelines, but schema
        discoverability is lower because shapes aren&apos;t enforced. You
        end up writing more sample-document prompts than you would with
        Postgres.
      </p>

      <h3>PlanetScale (Vitess MySQL)</h3>

      <p>
        Was the default vendor-neutral &quot;serverless MySQL&quot; for a
        while. Free tier disappeared in 2024 and that hurt the indie use
        case. Still excellent for high-write multi-region workloads with
        strong consistency, which is a smaller niche than the marketing
        suggested. Branching is good but Neon caught up.
      </p>

      <h3>Convex</h3>

      <p>
        Not a traditional database; a reactive backend with a Postgres-
        inspired query language. For frontend-first projects that want
        live subscriptions everywhere, Convex&apos;s ergonomics are
        unbeatable. Trade-off: lock-in. Agents handle it well because
        their docs are good, but the &quot;leave Convex later&quot; story
        is a real migration.
      </p>

      <h3>Firebase Firestore</h3>

      <p>
        Still here, still works, still in our books has a worse story for
        any project that&apos;s going to outgrow 10k DAU. The agent has
        seen so much Firestore code that it&apos;s fluent, but the rules
        language and the consistency model produce nasty surprises at
        scale. Pick it for prototypes and consumer apps with simple shape.
      </p>

      <ArticleH2 id="recommendation">A flowchart, sort of</ArticleH2>

      <p>
        Skip the diagram-drawing. Just answer these four questions:
      </p>

      <ol>
        <li>
          <strong>Are you building something with users, projects, and
          ownership?</strong> If yes, you want Postgres with RLS. That&apos;s
          Supabase or Neon + your auth provider.
        </li>
        <li>
          <strong>Do users get their own data island?</strong> (Notes apps,
          per-tenant SaaS where each customer&apos;s data is fully isolated.)
          Then Turso&apos;s database-per-user is your friend.
        </li>
        <li>
          <strong>Are you shipping a consumer app on Cloudflare?</strong>{" "}
          Then D1.
        </li>
        <li>
          <strong>Do you have a genuinely document-shaped domain?</strong>{" "}
          (Things where embedding nested arrays is the natural model, not
          a side-effect of being lazy about schema.) Then MongoDB.
        </li>
      </ol>

      <p>
        For most vibe-coded projects, the answer is the first one. That&apos;s
        why our money is on Postgres + Supabase as the default for the
        next year.
      </p>

      <Callout variant="tip" title="The one move that pays off for years">
        Whichever database you pick, generate a typed client (Drizzle for
        Postgres, drizzle-libsql for Turso, Prisma if you prefer) on day
        one and commit the generated types to git. Your AI agent reads
        those types every turn and produces correct code an order of
        magnitude more often than when it has to guess.
      </Callout>

      <ArticleH2 id="anti-patterns">Anti-patterns we keep seeing</ArticleH2>

      <h3>1. The &quot;agent picked Mongo for our SQL workload&quot; trap</h3>

      <p>
        Some agents default to MongoDB when prompted for &quot;a simple
        database&quot; because they&apos;ve seen it in starter templates.
        If your domain is relational (users have roles, roles have
        permissions, posts belong to users), tell the agent up front:
        &quot;use Postgres&quot;. Don&apos;t let the default win for the
        wrong reason.
      </p>

      <h3>2. Skipping migrations because the agent &quot;just edits the DB&quot;</h3>

      <p>
        Don&apos;t let the agent issue ad-hoc ALTER TABLE statements against
        production. Every change is a migration file. Migration files are
        what you&apos;ll need when you eventually onboard a teammate or
        rebuild the project on a fresh database.
      </p>

      <h3>3. RLS off &quot;to get unblocked&quot;</h3>

      <p>
        The single most expensive shortcut in any AI-paired Supabase project.
        RLS off means a buggy line of agent code is a data leak. Keep RLS
        on from day one; use{" "}
        <Link href="/blog/row-level-security-postgres-2026">the policy
        patterns</Link> we documented elsewhere.
      </p>

      <h3>4. No admin UI</h3>

      <p>
        The biggest day-2 cost of a vibe-coded project is the lack of an
        admin tool. Your agent can scaffold one in two hours; or you can
        point{" "}
        <Link href="/">a workspace</Link> at your database and have it
        already. Either way, do it before you have users.
      </p>

      <p>
        Pick the database that fits your shape and your stack. The
        ecosystem of tooling around Postgres makes it the safe default for
        most vibe-coded projects in 2026, but a sharply-shaped project
        (per-user data, document model, edge-only) can absolutely justify
        a different pick. The trick is to know which shape you have.
      </p>
    </>
  );
}
