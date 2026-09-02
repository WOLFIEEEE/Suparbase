import Link from "next/link";
import { ArticleH2, Callout } from "@/components/public/article-bits";

export const meta = {
  slug: "suparbase-vs-supabase-studio",
  leftName: "Suparbase",
  rightName: "Supabase Studio",
  title: "Suparbase vs Supabase Studio: When to use which (2026)",
  description:
    "Supabase Studio is the official dashboard. Suparbase is the dedicated admin workspace you point at the same project. Honest 2026 comparison: when Studio is enough, when Suparbase wins.",
  tldr:
    "Studio is the dashboard you get with every Supabase project. Suparbase is the admin layer for the gaps Studio doesn't cover: encrypted credential vault for team access, RLS simulator, custom action buttons, dashboard widgets, customer impersonation, AI agent attribution, and one-click session undo. Use both. Studio for project administration; Suparbase for day-to-day operations.",
  callouts: [
    { context: "Operating a Supabase project as a single dev", winner: "Studio (it ships with the project)" },
    { context: "Sharing admin access with a team without leaking service_role", winner: "Suparbase" },
    { context: "Vibe-coding with Cursor / Claude Code and want a safety net", winner: "Suparbase" },
    { context: "Multi-org / multi-project management", winner: "Studio" },
    { context: "RLS policy simulation against your real schema", winner: "Suparbase" },
  ],
  matrix: [
    { feature: "Hosting", left: "Hosted SaaS; dedicated single-tenant deployment by agreement", right: "Bundled with every Supabase project" },
    { feature: "Project management (create, billing, regions)", left: "Out of scope", right: "Native" },
    { feature: "Table editor", left: "Yes (PostgREST proxy)", right: "Yes" },
    { feature: "SQL editor", left: "Yes, read-only by default, statement timeout, audit log", right: "Yes" },
    { feature: "Schema browser", left: "Yes, FK chips, archetype groups", right: "Yes" },
    { feature: "Storage browser", left: "Yes, drag-drop, signed URLs", right: "Yes" },
    { feature: "Auth users admin", left: "Yes, with per-user sessions + related-records inspector", right: "Yes, basic CRUD" },
    { feature: "RLS policy browser", left: "Yes", right: "Yes" },
    { feature: "RLS policy simulator (paste a JWT, run a query, see allow/deny)", left: "Yes", right: "No" },
    { feature: "Row history (before/after diffs per row)", left: "Yes, audit log surfaced on detail pages", right: "No" },
    { feature: "AI chat with schema awareness + write proposals", left: "Yes, OpenRouter, BYO key, diff-confirmed writes", right: "Yes (Studio AI)" },
    { feature: "Custom actions (declarative buttons backed by SQL / webhooks)", left: "Yes", right: "No" },
    { feature: "Dashboard widgets (KPI tiles, charts, lists from SQL)", left: "Yes, per connection", right: "No" },
    { feature: "Team workspace (invite teammates with editor / viewer roles)", left: "Yes, expiring URL invites or Resend email", right: "Project-level, single team only" },
    { feature: "Customer impersonation (per-user sessions, related-records)", left: "Yes", right: "No" },
    { feature: "AI-agent attribution (group writes by Cursor / Claude / Replit Agent)", left: "Yes (Sentry v3.1)", right: "No" },
    { feature: "One-click session undo (rewind a Cursor agent's writes)", left: "Yes (Sentry v3.1)", right: "No" },
    { feature: "Continuous RLS drift probe + auto-quarantine", left: "Yes (Sentry v3.0)", right: "No (Security Advisors are weekly)" },
    { feature: "API key in browser?", left: "No, encrypted vault + server-side proxy", right: "Service role is in the dashboard session" },
    { feature: "Licensing", left: "Proprietary (hosted SaaS, free tier)", right: "Apache 2.0 (Studio source available)" },
    { feature: "Hosted free tier", left: "Yes (3 connections, no credit card)", right: "Yes (Supabase free plan)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <Callout variant="note">
        These two are not really competitors. Studio is the project console
        you log into to spin up a database, manage billing, and configure auth
        settings. Suparbase is the day-to-day admin workspace you point at
        the project Studio created. Most teams that get past month one end
        up running both.
      </Callout>

      <ArticleH2 id="when-studio-is-enough">When Studio alone is enough</ArticleH2>
      <ul>
        <li>
          <strong>Solo developer, single project.</strong> You log into the
          Supabase dashboard once a day, edit a row, run a SQL query, and
          ship. Studio is fine. Suparbase would be unnecessary friction.
        </li>
        <li>
          <strong>You only need project administration.</strong> Billing,
          regions, edge functions, secrets, log explorer, OAuth providers, the
          rest of the Supabase platform: Studio owns this layer and Suparbase
          intentionally stays out of it.
        </li>
        <li>
          <strong>You&apos;re happy putting your service_role key into a
          browser session.</strong> Studio holds it. That&apos;s a deliberate
          trade-off, but it&apos;s a trade-off.
        </li>
      </ul>

      <ArticleH2 id="when-suparbase-wins">When Suparbase earns its place</ArticleH2>
      <ul>
        <li>
          <strong>You need to share access without sharing the service_role
          key.</strong> Suparbase encrypts the key at rest with AES-256-GCM
          and proxies every request server-side. Team members hit the proxy
          with a session cookie, never with the project key. Studio can give
          a teammate access to the project, but they get the project key.
        </li>
        <li>
          <strong>You ship with Cursor / Claude Code / Lovable / v0 and want
          a safety net.</strong> Suparbase&apos;s{" "}
          <Link href="/agent-sentry">Agent Sentry</Link> identifies each AI
          tool by User-Agent, groups its writes into sessions, and lets you
          one-click undo the whole session if it does something stupid. Studio
          doesn&apos;t know who wrote a row.
        </li>
        <li>
          <strong>You want continuous RLS drift detection.</strong> Studio
          ships <em>Security Advisors</em> (weekly email + a dashboard
          banner). Suparbase&apos;s Sentry probes every public table with the
          actual anon key on demand and flags anon-readable PII the moment
          it appears, with one-click Quarantine to block it.
        </li>
        <li>
          <strong>You want to simulate RLS policies.</strong> Paste a JWT
          claim set, pick a verb, run the query, see allow/deny per policy.
          Studio shows the policy text; Suparbase actually executes them
          under your custom claims.
        </li>
        <li>
          <strong>You want declarative buttons for your business logic.</strong>{" "}
          &quot;Refund this order.&quot; &quot;Approve this seller.&quot;{" "}
          <Link href="/features">Suparbase Custom Actions</Link> let you wire
          a SQL template or an HTTP webhook to a button that appears on the
          row detail page. Studio is generic CRUD.
        </li>
        <li>
          <strong>You want one dashboard with KPI tiles.</strong> Connection
          dashboards turn any SELECT into a chart: row counts over time, top-N
          values, custom SQL queries pinned as tiles. The number you check
          every morning, in the same place as the tables you edit.
        </li>
        <li>
          <strong>You&apos;re a support engineer.</strong> Per-user pages
          show the user&apos;s active auth sessions, all the tables that
          reference them, and quick actions for password reset / session
          revoke / delete. No need to write five queries to debug one ticket.
        </li>
      </ul>

      <ArticleH2 id="security-tradeoffs">A note on credential handling</ArticleH2>
      <p>
        The most consequential difference between the two: the service_role
        key. Studio expects you to be logged into the Supabase platform and
        treats the dashboard session as the trust boundary, which means the
        key effectively lives in your browser (encrypted in transit, but
        decryptable client-side once you&apos;re in). Suparbase stores it
        encrypted in a vault and never exposes it to the client. Every
        PostgREST call routes through a Next.js route handler that decrypts
        the key inside the Node process.
      </p>
      <p>
        For a solo developer, this distinction is academic. For a team where
        you don&apos;t want every engineer to be able to bypass RLS at any
        time, it&apos;s the difference between &quot;the new hire can drop
        the users table from their laptop&quot; and &quot;the new hire is a
        viewer until you flip them to editor in connection settings.&quot;
      </p>

      <ArticleH2 id="recommendation">Recommendation</ArticleH2>
      <p>
        Use Studio for everything that <em>is</em> the platform: creating
        projects, billing, regions, auth providers, edge functions, log
        explorer, the actual database settings. That&apos;s what it&apos;s
        designed for and there&apos;s no point reinventing it.
      </p>
      <p>
        Add Suparbase on top once any of these is true: you have a team, you
        ship with AI agents, you care about RLS not silently breaking, or you
        find yourself running the same SQL query in the editor every morning
        and wishing it were a tile on a dashboard. It takes about five
        minutes to set up and you keep using Studio for everything it&apos;s
        good at.
      </p>
      <p>
        Suparbase has a free hosted tier for solo projects and paid plans for
        teams. Team plans include single-tenant deployments for organisations
        with strict residency or compliance needs.
      </p>
    </>
  );
}
