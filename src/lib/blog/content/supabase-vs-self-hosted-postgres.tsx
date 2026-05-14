import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-vs-self-hosted-postgres",
  title: "Supabase vs Self-Hosted Postgres: When to Choose Which in 2026",
  description:
    "A 2026 comparison of managed Supabase, Supabase self-hosted, and rolling your own Postgres. Picks where each wins, where they break, and the migration paths between them.",
  publishedAt: "2026-04-15",
  updatedAt: "2026-05-14",
  readingMinutes: 16,
  tags: ["postgres", "supabase", "architecture"],
  related: ["multi-tenant-saas-postgres", "row-level-security-postgres-2026", "postgres-connection-pooling-2026"],
  toc: [
    { id: "the-three-options", label: "The three real options" },
    { id: "managed-supabase", label: "Managed Supabase, end of 2025 reality" },
    { id: "self-hosted-supabase", label: "Self-hosted Supabase" },
    { id: "diy-postgres", label: "DIY Postgres + a stack" },
    { id: "decision-matrix", label: "Decision matrix" },
    { id: "migration-paths", label: "Migration paths between them" },
    { id: "what-we-do", label: "What we actually do" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Supabase ate the &quot;Postgres + auth + storage + realtime&quot; market
        from 2021 onward by being radically easier than the alternatives. In
        2026 that ease still matters, but the trade-offs around self-hosting
        Supabase, or skipping the bundle entirely and assembling your own
        Postgres-centric stack, have changed enough to be worth re-litigating.
      </p>

      <p>
        This is the framework we actually use when teams ask us &quot;should we
        stay on hosted Supabase?&quot;
      </p>

      <ArticleH2 id="the-three-options">The three real options</ArticleH2>

      <p>
        There aren&apos;t two options; there are three. Mixing the first two up
        is where most of the confusion in this debate comes from.
      </p>

      <ol>
        <li>
          <strong>Managed Supabase</strong> — supabase.com hosts your database,
          your auth, your storage, your edge functions. You hit the dashboard;
          they handle the boxes.
        </li>
        <li>
          <strong>Self-hosted Supabase</strong> — you run the open-source
          Supabase stack (GoTrue, PostgREST, Storage, Realtime, Studio,
          Kong) on your own infrastructure. Same APIs as managed; you operate
          the boxes.
        </li>
        <li>
          <strong>DIY Postgres + assembled stack</strong> — managed Postgres
          (Neon, RDS, Crunchy, Fly Postgres) plus pieces you pick yourself for
          auth (Clerk, Auth.js, your own table), storage (S3, R2), and so on.
          No Supabase code anywhere.
        </li>
      </ol>

      <ArticleH2 id="managed-supabase">Managed Supabase, end of 2025 reality</ArticleH2>

      <p>
        For 90% of new SaaS projects, this is still the right starting point.
        The 2025 platform improvements were significant: branching databases
        for preview environments, much better connection pooling via
        Supavisor, a real free-tier replacement (the &quot;Compute Add-on&quot;
        model), and proper read replicas. The DX is hard to beat.
      </p>

      <p>You should stay on managed Supabase as long as:</p>

      <ul>
        <li>You&apos;re happy paying per-project compute past the free tier.</li>
        <li>You can live with the (improving) cold-start latency on Edge Functions.</li>
        <li>You don&apos;t need a VPC-private database or single-tenant infrastructure.</li>
        <li>Your data residency constraints fit the regions Supabase offers.</li>
        <li>You don&apos;t need to install extensions outside their allow-list.</li>
      </ul>

      <p>You start to outgrow it when:</p>

      <ul>
        <li>
          Connection counts spike during traffic bursts and Supavisor
          transaction-mode pooling stops being enough.
        </li>
        <li>
          You need to install custom extensions like <code>pg_partman</code>{" "}
          for very large time-series tables, or replication tooling not in
          their allow-list.
        </li>
        <li>
          You need on-prem or a specific compliance posture (HIPAA, certain
          government baselines, India&apos;s DPDPA &quot;significant data
          fiduciary&quot; regime).
        </li>
        <li>
          Your monthly bill clears five figures and the equivalent on
          managed-Postgres + DIY would be roughly half.
        </li>
      </ul>

      <Callout variant="tip" title="When the bill is the trigger">
        Cost is the most-cited reason teams &quot;consider leaving&quot;
        managed Supabase, and the least-often the real reason once they
        actually price it out. Migrating away costs engineering weeks. Make
        sure the saving justifies that. (Operational complexity will eat into
        it.)
      </Callout>

      <ArticleH2 id="self-hosted-supabase">Self-hosted Supabase</ArticleH2>

      <p>
        The middle path. You get the same client SDKs, the same PostgREST API
        shape, the same RLS story, but the database and services run on your
        infrastructure. The Supabase Docker bundle is what most teams use.
        Coolify, Railway, and Fly each have one-click recipes.
      </p>

      <p>Worth doing when:</p>

      <ul>
        <li>
          You need to keep data in a specific region, on specific hardware,
          or inside a VPC that managed Supabase can&apos;t peer into.
        </li>
        <li>
          Your traffic is high enough that the per-project pricing on hosted
          starts to look silly compared to the cost of a beefy VM and a
          managed Postgres backing it.
        </li>
        <li>
          You want to extend the stack: custom GoTrue identity providers,
          additional Postgres extensions, alternative storage backends.
        </li>
      </ul>

      <p>The honest downsides:</p>

      <ul>
        <li>
          You own the on-call. Upgrades, security patches, backups,
          monitoring are now yours.
        </li>
        <li>
          The realtime service is the trickiest piece to operate at scale —
          it&apos;s a separate Elixir app with its own quirks.
        </li>
        <li>
          Studio (the admin UI) is the Supabase product&apos;s weak point when
          you self-host. It assumes you have a single-tenant project and
          its multi-environment story isn&apos;t great. (This is the gap{" "}
          <Link href="/">Suparbase</Link> exists to fill, but we&apos;re biased.)
        </li>
      </ul>

      <ArticleH2 id="diy-postgres">DIY Postgres + a stack</ArticleH2>

      <p>
        The third path is: just Postgres, plus the auth/storage you actually
        want, with none of Supabase&apos;s stack on top. In 2026 this is more
        viable than ever because:
      </p>

      <ul>
        <li>
          Neon&apos;s branching, autoscaling, and bottomless storage make it
          a near-drop-in for Supabase&apos;s database half.
        </li>
        <li>
          Clerk and Auth.js are both mature enough to replace GoTrue for most
          shapes of app, including B2B tenants and SSO.
        </li>
        <li>
          R2 / S3 + a small signing proxy gives you Supabase Storage&apos;s API
          with a 90% smaller surface area.
        </li>
        <li>
          You skip PostgREST entirely and write your own server. With Next.js
          route handlers, Drizzle, and tRPC or oRPC, the &quot;write your own
          BFF&quot; pattern is unrecognisable from where it was in 2020.
        </li>
      </ul>

      <CodeBlock language="ts" filename="hand-rolled-supabase-alt.ts">{`// Postgres via Drizzle, auth via Clerk, storage via R2.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auth } from "@clerk/nextjs/server";

const sql = postgres(process.env.DATABASE_URL!, { max: 10, prepare: false });
const db = drizzle(sql);

export async function listMyPosts() {
  const { userId } = auth();
  if (!userId) return [];
  return db.execute(
    \`SELECT id, title, status FROM posts WHERE author_id = \${userId}
     ORDER BY created_at DESC LIMIT 50\`,
  );
}`}</CodeBlock>

      <p>
        The trade-off: you wrote that endpoint, including its auth check,
        instead of letting RLS handle it. For a small team that doesn&apos;t
        already speak Postgres fluently, the &quot;RLS handles authorization
        at the database&quot; story Supabase ships is a meaningful win.
        For a team that&apos;s already writing servers anyway, the integration
        tax of Supabase&apos;s opinions can outweigh the win.
      </p>

      <ArticleH2 id="decision-matrix">Decision matrix</ArticleH2>

      <p>
        We don&apos;t do scorecards because they hide the relative weights. But
        as a rough heat-map:
      </p>

      <ul>
        <li>
          <strong>You&apos;re a single-developer side project</strong> →
          managed Supabase. Free tier, two clicks, done.
        </li>
        <li>
          <strong>You&apos;re a B2B SaaS, &lt; $5k/mo Postgres bill</strong> →
          managed Supabase. The dev velocity from RLS + the bundled services
          beats the cost.
        </li>
        <li>
          <strong>You&apos;re B2B SaaS, $5k-$50k/mo Postgres bill</strong> →
          honest conversation about self-hosted Supabase vs DIY. Often the
          right answer is &quot;migrate the database to Neon or RDS, keep
          GoTrue + PostgREST on a small VM for now, plan to replace those over
          12 months&quot;.
        </li>
        <li>
          <strong>You&apos;re an agency operating 20+ client projects</strong>{" "}
          → managed Supabase per client, with a centralised admin tool (this
          is exactly the pattern{" "}
          <Link href="/use-cases/agency-multi-client">we built for</Link>).
        </li>
        <li>
          <strong>You&apos;re building consumer apps with millions of users</strong>{" "}
          → DIY. The bundled services break first under load; you&apos;ll end
          up replacing them piecewise anyway.
        </li>
        <li>
          <strong>You have a heavy compliance posture</strong> → self-hosted
          Supabase, or DIY with a managed-Postgres provider that has the
          certifications you need.
        </li>
      </ul>

      <ArticleH2 id="migration-paths">Migration paths between them</ArticleH2>

      <p>None of these decisions are permanent.</p>

      <h3>Managed → Self-hosted Supabase</h3>

      <p>
        This is the easiest direction. <code>pg_dump</code> the database,
        restore into your own Postgres, point a fresh Supabase Docker bundle
        at it, replicate your auth users via the GoTrue admin API. Plan a
        couple of hours of downtime; do it on a Saturday.
      </p>

      <h3>Managed → DIY Postgres</h3>

      <p>
        The expensive migration. You need to replace GoTrue (Auth.js or Clerk
        can import auth.users with some effort), replace Storage (R2 + a
        signing function), and replace PostgREST (write a backend). Budget
        weeks, not days. The savings are real if you&apos;re large enough that
        the percentage matters.
      </p>

      <h3>Self-hosted Supabase → Managed Supabase</h3>

      <p>
        Less common but plausible. You&apos;ll bring your auth users via the
        same admin API; your storage objects need to be reuploaded. Database
        is a <code>pg_dump</code> away.
      </p>

      <ArticleH2 id="what-we-do">What we actually do</ArticleH2>

      <p>
        Suparbase ourselves is a Next.js app talking to Postgres (Neon for
        production, Postgres-in-a-Docker for local dev) with NextAuth handling
        sessions. We don&apos;t run any Supabase services for our own product
        because we don&apos;t need them — the whole point of the product is
        to operate <em>other people&apos;s</em> Supabase projects.
      </p>

      <p>
        We send our customers to managed Supabase nine times out of ten.
        It&apos;s where ~80% of the apps we admin live. The other ~20% are
        self-hosted Supabase (regulated industries) or pure-Postgres
        (high-scale apps that outgrew the bundle). All three shapes work fine
        with{" "}
        <Link href="/features">our workspace</Link>: the only thing it needs
        is a PostgREST endpoint and a key.
      </p>

      <p>
        The choice that matters most isn&apos;t Supabase vs DIY. It&apos;s
        whether you build a tooling layer around your database that you trust.
        Once that&apos;s in place, the underlying host is a swappable detail.
      </p>
    </>
  );
}
