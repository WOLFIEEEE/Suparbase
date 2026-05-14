import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-vs-neon",
  leftName: "Supabase",
  rightName: "Neon",
  title: "Supabase vs Neon: Two Takes on Postgres in 2026",
  description:
    "Two serverless Postgres platforms with different bets. Supabase: bundled services. Neon: branching-first. Which one to pick in 2026.",
  tldr:
    "Supabase is the bundle (Postgres + Auth + Storage + Realtime); Neon is just Postgres, done very well. Pick Supabase when you want the rest of the stack handled. Pick Neon when you want best-in-class Postgres and you already have or want to pick the other pieces yourself.",
  callouts: [
    { context: "Full stack from one vendor", winner: "Supabase" },
    { context: "Best-in-class Postgres branching", winner: "Neon" },
    { context: "BYO auth (Clerk, Auth.js)", winner: "Neon" },
    { context: "RLS-first authorization", winner: "Supabase" },
  ],
  matrix: [
    { feature: "Auth", left: "GoTrue + JWT, bundled", right: "BYO (Clerk, Auth.js, etc.)" },
    { feature: "Storage", left: "S3-compatible, bundled", right: "BYO (R2, S3)" },
    { feature: "Realtime", left: "Bundled (replication-based)", right: "BYO (write your own)" },
    { feature: "Branching", left: "Yes (preview branches)", right: "Yes (first-class, mature)" },
    { feature: "Connection pooling", left: "Supavisor (transaction-mode native)", right: "PgBouncer + serverless driver" },
    { feature: "Cold starts", left: "Pro tier always-warm", right: "Autoscale-to-zero on hobby" },
    { feature: "Extensions allow-list", left: "Curated", right: "Curated, but slightly wider" },
    { feature: "RLS-as-authz primitive", left: "First-class (RLS is the model)", right: "Available, but you wire auth yourself" },
    { feature: "Pricing model", left: "Per-project compute", right: "Compute-hours + storage" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-supabase-wins">When Supabase wins</ArticleH2>
      <ul>
        <li>
          You want auth, storage, realtime, and Postgres from one vendor.
          The integration tax is paid for you.
        </li>
        <li>
          You&apos;re using RLS as your primary authorization layer.
          Supabase&apos;s entire DX is built around this.
        </li>
        <li>
          You&apos;re a solo founder or small team and you genuinely don&apos;t
          want to think about which auth provider to pick.
        </li>
        <li>
          You&apos;re vibe-coding and want the agent to wire up CRUD endpoints
          quickly. PostgREST gives the agent a typed REST API for free.
        </li>
      </ul>

      <ArticleH2 id="when-neon-wins">When Neon wins</ArticleH2>
      <ul>
        <li>
          Branching is your killer feature. Neon&apos;s branching is more
          mature than Supabase&apos;s and the hobby-tier autopausing makes
          per-PR preview environments effectively free.
        </li>
        <li>
          You already have an auth provider you like (Clerk, Auth.js, your
          own).
        </li>
        <li>
          You want vanilla Postgres without anyone&apos;s bundle on top.
          More flexibility, fewer opinions.
        </li>
        <li>
          You&apos;re running on Vercel and want their serverless driver
          to skip connection pooling entirely.
        </li>
      </ul>

      <ArticleH2 id="hybrid">The hybrid pattern</ArticleH2>
      <p>
        Plenty of teams in 2026 use both: Neon as the database, Supabase
        as a managed PostgREST + GoTrue layer pointed at the same Postgres.
        It works, but it&apos;s an awkward middle ground &mdash; you&apos;re
        paying for two services with overlapping responsibilities. Pick
        one and lean in.
      </p>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        The bundle vs unbundled question is the real one. Supabase&apos;s
        bundle saves a lot of decisions and a lot of wiring; the cost is
        being inside someone else&apos;s stack. Neon&apos;s focused
        Postgres play gives you maximum optionality; the cost is wiring up
        auth, storage, and realtime yourself.
      </p>
      <p>
        For most new projects in 2026, Supabase is the path of least
        resistance. For larger teams that have already picked an auth
        layer and want best-in-class Postgres operations, Neon wins. The
        two products genuinely have different shapes; the &quot;which is
        better?&quot; framing usually obscures more than it reveals.
      </p>
    </>
  );
}
