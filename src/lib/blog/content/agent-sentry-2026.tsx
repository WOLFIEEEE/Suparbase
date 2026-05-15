import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "agent-sentry-2026",
  title: "Your AI agent will eventually delete your database. Here's the seat-belt.",
  description:
    "Three 2026 post-mortems show the same shape: an AI agent leaked PII or deleted prod, and existing tooling caught it weekly. Agent Sentry is the always-on probe + one-click undo for vibe-coded Supabase projects.",
  publishedAt: "2026-05-15",
  readingMinutes: 11,
  tags: ["vibe-coding", "supabase", "rls", "ai-safety"],
  related: ["cursor-plus-supabase-2026", "why-supabase-for-ai-agents", "vibe-coding-database-patterns"],
  toc: [
    { id: "three-incidents", label: "Three 2026 incidents, one shape" },
    { id: "why-existing-tools-miss", label: "Why existing tools miss them" },
    { id: "what-sentry-does", label: "What Agent Sentry does" },
    { id: "probe", label: "The probe loop" },
    { id: "attribution", label: "Agent attribution" },
    { id: "undo", label: "One-click session undo" },
    { id: "wire-it-up", label: "Wire it up" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        2026 has been a brutal year for vibe-coded Supabase projects. The same
        failure mode keeps eating production: an AI agent did a thing the human
        didn&apos;t fully understand, and by the time anyone noticed, the data
        was either on the public internet or gone.
      </p>
      <p>
        I built <Link href="/agent-sentry">Agent Sentry</Link> on top of <Link href="/">Suparbase</Link>
        as a direct response: a continuous security watchdog plus a per-agent
        safety net. This post walks through the incident pattern that motivated
        it, why the existing tools miss it, and how Sentry catches both halves.
      </p>

      <ArticleH2 id="three-incidents">Three 2026 incidents, one shape</ArticleH2>
      <p>
        These three are public. There are dozens more in private Slack
        post-mortems.
      </p>
      <ul>
        <li>
          <strong>Moltbook (January)</strong>: launched the 28th, leaked 1.5M
          API keys and every user record by the 31st. The AI built tables
          without RLS; the anon key worked as a master key against the REST
          surface.{" "}
          <a
            href="https://blog.ogwilliam.com/post/moltbook-hack-supabase-vibe-coding"
            target="_blank"
            rel="noopener noreferrer"
          >
            Post-mortem
          </a>
          .
        </li>
        <li>
          <strong>Lovable CVE-2025-48757 (February)</strong>: a scan of 1,764
          vibe-coded apps found 453 with critical vulnerabilities. 170 had
          inverted RLS, &ldquo;if you&apos;re logged in, you can read every
          row.&rdquo; 80% of vibe-coded apps share that exact mistake.{" "}
          <a
            href="https://dev.to/stefan_lederer_8b1bbcef01/we-scanned-1764-vibe-coded-apps-453-had-critical-vulnerabilities-heres-what-we-found-beyond-464e"
            target="_blank"
            rel="noopener noreferrer"
          >
            Scan write-up
          </a>
          .
        </li>
        <li>
          <strong>PocketOS (April)</strong>: Cursor&apos;s Claude Opus 4.6 agent
          hit a credential mismatch, found a Railway token in an unrelated
          file, and deleted the volume. Database and backups, gone in 9
          seconds.{" "}
          <a
            href="https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-powered-ai-coding-agent-deletes-entire-company-database-in-9-seconds-backups-zapped-after-cursor-tool-powered-by-anthropics-claude-goes-rogue"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tom&apos;s Hardware
          </a>
          .
        </li>
      </ul>

      <Callout variant="watch-out">
        The blast radius is always bigger than &ldquo;our AI made a mistake.&rdquo;
        Moltbook&apos;s users had their private messages indexed by Google before
        the team noticed. PocketOS lost everything they had ever shipped. The
        gap between &ldquo;something happened&rdquo; and &ldquo;a human read the
        weekly Security Advisors email&rdquo; is the entire problem.
      </Callout>

      <ArticleH2 id="why-existing-tools-miss">Why existing tools miss them</ArticleH2>
      <p>
        There&apos;s a whole cottage industry of Supabase scanners now, and
        every single one shares the same shape. They&apos;re point-in-time
        scans, or they&apos;re loggers, or they&apos;re both. None of them
        combine continuous probing with the kill-switch.
      </p>
      <ul>
        <li>
          <strong>AuditYourApp, SupaSec, the open-source supabase-security-skill</strong>:
          all do one-shot scans. Great for a baseline. Useless once the AI
          edits the schema an hour later.
        </li>
        <li>
          <strong>Supabase&apos;s own Security Advisors (Splinter)</strong>:
          weekly emails. Better than nothing. By the time you read it, the
          breach has been live for days.
        </li>
        <li>
          <strong>PGAudit, Postgres logs</strong>: record everything. Tell you
          nothing about which agent did what or how to undo it.
        </li>
        <li>
          <strong>Replit checkpoints</strong>: actually work for project-state
          rollback. Only inside Replit. Don&apos;t help when Cursor /
          Claude Code / Lovable / v0 / your own MCP server are the agents.
        </li>
      </ul>

      <ArticleH2 id="what-sentry-does">What Agent Sentry does</ArticleH2>
      <p>
        Two halves. Together they cover both incident classes, the RLS-leak
        class (Moltbook, Lovable) and the agent-nuke class (PocketOS).
      </p>

      <ArticleH2 id="probe">The probe loop</ArticleH2>
      <p>
        For every table in the public schema, Sentry fires a single
        unauthenticated <code>GET /rest/v1/&lt;table&gt;?limit=3</code> with
        the stored anon key. A 200 with rows means anon can read it. A 200
        with an empty array means RLS is correctly hiding the rows (no
        false positive). 401/403 means RLS is doing its job.
      </p>
      <p>
        When the connection has the Direct Postgres URL set, Sentry also
        reads <code>pg_class.relrowsecurity</code> + <code>pg_policy</code>{" "}
        to catch tables where RLS is off outright, tables with zero
        policies, and policies whose <code>USING</code> clause is just{" "}
        <code>true</code>, the inverted-logic mistake from CVE-2025-48757.
      </p>
      <CodeBlock language="sql">{`SELECT n.nspname, c.relname, c.relrowsecurity,
       jsonb_agg(json_build_object('policy', p.polname,
                                    'qual', pg_get_expr(p.polqual, p.polrelid)))
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relkind = 'r' AND n.nspname = 'public'
GROUP BY n.nspname, c.relname, c.relrowsecurity;`}</CodeBlock>
      <p>
        Anon-readable tables get matched against a conservative PII column-name
        pattern: password, secret, api_key, refresh_token, ssn, credit_card,
        phone, email, address, dob, passport. Hits jump from{" "}
        <code>warn</code> to <code>critical</code>. When a critical finding
        lands, the Quarantine button applies a temporary RESTRICTIVE policy:
      </p>
      <CodeBlock language="sql">{`ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY suparbase_sentry_<id>
  ON public.users AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false);`}</CodeBlock>
      <p>
        The bleeding stops. The Lift button drops the policy when you&apos;ve
        fixed the underlying issue.
      </p>

      <ArticleH2 id="attribution">Agent attribution</ArticleH2>
      <p>
        Suparbase&apos;s PostgREST proxy already touched every authenticated
        write. v3.1 adds a fingerprinter that reads the User-Agent and
        buckets the request into an <code>agent_session</code> row.
        Cursor, Claude Code, Replit Agent, Lovable, v0, the Vercel AI SDK,
        and OpenRouter are all recognised by their UA. Anything that
        mentions an LLM-related term but doesn&apos;t match a specific
        vendor falls into <code>ai_unknown</code>. Real browser sessions
        and CLI tools fall into <code>browser</code> / <code>cli</code> so
        you can spot human curl traffic vs. agent fetch traffic.
      </p>
      <p>
        Sessions extend on a 5-minute rolling window per (user, connection,
        agent_kind). One agent &ldquo;refactor&rdquo; doing 47 mutations
        across 3 tables lands in one session row, not 47.
      </p>

      <ArticleH2 id="undo">One-click session undo</ArticleH2>
      <p>
        Every audit-log row now links back to its session. Undo walks those
        rows newest-first and builds reverse SQL per verb:
      </p>
      <ul>
        <li><code>INSERT</code> → <code>DELETE FROM ... WHERE pk = ...</code></li>
        <li><code>UPDATE</code> → <code>UPDATE ... SET (beforeRow cols) WHERE pk = ...</code></li>
        <li><code>DELETE</code> → <code>INSERT INTO ... VALUES (beforeRow)</code></li>
      </ul>
      <p>
        All of them run in <em>one</em> Postgres transaction via the Direct
        Postgres URL. Either every reversal succeeds, or none does.
        PocketOS would have had a button.
      </p>
      <Callout variant="note">
        <strong>Why we bypass RLS for undo.</strong> RLS would refuse to write
        back rows the anon / authenticated role can&apos;t even see. Undo is
        an admin operation the human explicitly authorised, so we use the
        Direct Postgres URL. It&apos;s the same encrypted-at-rest blob the
        SQL playground uses, gated by your Suparbase session.
      </Callout>

      <ArticleH2 id="wire-it-up">Wire it up</ArticleH2>
      <ol>
        <li>
          Connect your Supabase project at{" "}
          <Link href="/signup">Suparbase</Link> and add the API key.
        </li>
        <li>
          Add the optional Direct Postgres URL on the connection page -{" "}
          <Link href="/agent-sentry">Sentry</Link>&apos;s pg_policies
          inspector and the undo engine both use it.
        </li>
        <li>
          Open <code>/c/&lt;id&gt;/sentry</code>, hit Scan now. Baseline your
          exposure today.
        </li>
        <li>
          Open <code>/c/&lt;id&gt;/agents</code>. Every AI write your team
          ships through Suparbase from now on lands in a session you can
          undo.
        </li>
      </ol>
      <p>
        Suparbase is MIT-licensed and self-host-friendly, drop your own
        deployment behind Coolify and the whole thing runs on a single
        Postgres + Node container. The full <Link href="/agent-sentry">Sentry
        feature page</Link> has the FAQ + a side-by-side with the existing
        scanner cottage industry.
      </p>
    </>
  );
}
