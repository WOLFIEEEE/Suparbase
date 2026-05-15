import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  Database,
  FolderOpen,
  KeyRound,
  ShieldCheck,
  Sparkles,
  SquareCode,
} from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Docs · Suparbase",
  description:
    "Quickstart, security model, connections, AI assistant, RLS debugger, SQL playground, audit log. Everything you need to operate Suparbase.",
};

interface TocEntry {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOC: TocEntry[] = [
  { id: "quickstart", label: "Quickstart", icon: BookOpen },
  { id: "connections", label: "Connections", icon: Database },
  { id: "security", label: "Security model", icon: ShieldCheck },
  { id: "ai", label: "AI assistant", icon: Sparkles },
  { id: "rls", label: "RLS debugger", icon: ShieldCheck },
  { id: "sql", label: "SQL playground", icon: SquareCode },
  { id: "storage", label: "Storage", icon: FolderOpen },
  { id: "auth-users", label: "Auth users", icon: KeyRound },
  { id: "audit", label: "Audit log", icon: Activity },
];

export default async function DocsPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Documentation"
          title="Everything you need to operate Suparbase."
          subtitle="One page on purpose. Quickstart at the top; deep dives below. Use the sidebar to jump."
        />

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[14rem_1fr]">
          <aside className="md:sticky md:top-20 md:self-start">
            <nav aria-label="Docs sections">
              <ul className="space-y-1">
                {TOC.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="inline-flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-raised hover:text-fg"
                    >
                      <Icon className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0">
            <Prose>
              <section id="quickstart">
                <h2>Quickstart</h2>
                <p>
                  Suparbase takes about three minutes to go from zero to a usable admin workspace
                  pointed at your Supabase project.
                </p>
                <ol>
                  <li>
                    <strong>Sign up</strong> at <Link href="/signup">/signup</Link>. Email and a 12+ character password,
                    or GitHub OAuth if the operator has enabled it.
                  </li>
                  <li>
                    <strong>Save your project</strong> by pasting the Supabase URL and a key (any role: <code>anon</code>,{" "}
                    <code>authenticated</code>, or <code>service_role</code>). The key is AES-256-GCM encrypted before the
                    row commits to the database.
                  </li>
                  <li>
                    <strong>Open the dashboard</strong>. The first load runs an AI schema analysis (optional, gracefully
                    degrades to heuristics) so tables get the right archetype, display name, and column priorities
                    automatically.
                  </li>
                  <li>
                    <strong>Click a table</strong>. Browse rows, edit inline, bulk update, export CSV, search across
                    every table with Cmd-K.
                  </li>
                </ol>
              </section>

              <section id="connections">
                <h2>Connections</h2>
                <p>
                  A connection is a saved Supabase project. Each connection holds:
                </p>
                <ul>
                  <li>
                    <code>url</code>: your project URL, e.g. <code>https://abc.supabase.co</code>
                  </li>
                  <li>
                    <code>encrypted_key</code>: the PostgREST key, encrypted at rest. Used for every CRUD operation
                    and for the Storage / Auth admin endpoints.
                  </li>
                  <li>
                    <code>encrypted_postgres_url</code> (optional): a direct Postgres connection string. Only the RLS
                    debugger and SQL playground read this. The URL is never echoed back over the wire: the connection
                    summary only exposes <code>hasPostgresUrl: boolean</code>.
                  </li>
                </ul>
                <p>
                  The role you store determines what works: a <code>service_role</code> key gets you the full Auth users
                  admin page; <code>anon</code> / <code>authenticated</code> keys can still read and write through PostgREST under
                  whatever RLS policies you've set.
                </p>
              </section>

              <section id="security">
                <h2>Security model</h2>
                <p>
                  Suparbase exists because storing a Supabase API key in a browser is a foot-gun. The whole product is
                  built around three rules.
                </p>
                <h3>1. The key never reaches the browser</h3>
                <p>
                  Every PostgREST request goes through an authenticated Next.js route handler. The session cookie
                  identifies you; the route handler looks up your connection, decrypts the key in memory, and forwards
                  the request to Supabase. Your browser only ever holds the session.
                </p>
                <h3>2. Encryption at rest</h3>
                <p>
                  Keys are AES-256-GCM encrypted with a key from <code>SUPARBASE_ENCRYPTION_KEY</code>. The plaintext
                  exists only as a request-scoped local variable inside the server. No file, log, or metric ever sees
                  the bytes.
                </p>
                <h3>3. Audit every write</h3>
                <p>
                  Every successful insert, update, and delete writes a row to <code>audit_log</code> with the user, connection, table, primary key, verb, and (when available)
                  before / after snapshots. This is what powers the row history panel.
                </p>
              </section>

              <section id="ai">
                <h2>AI assistant</h2>
                <p>
                  Click <strong>Ask AI</strong> in the bottom-right of any workspace page. The agent runs server-side
                  against your stored OpenRouter key and has four read tools and three write-proposal tools.
                </p>
                <h3>Read tools</h3>
                <ul>
                  <li><code>list_tables</code>: catalogue with AI-inferred display names and categories.</li>
                  <li><code>get_table_schema</code>: full column list with types, PKs, FKs.</li>
                  <li><code>query_rows</code>: filtered SELECT (up to 50 rows).</li>
                  <li><code>count_rows</code>: aggregate count with filters.</li>
                </ul>
                <h3>Write proposals</h3>
                <p>
                  The agent <em>never</em> writes directly. <code>propose_update</code>, <code>propose_insert</code>, and{" "}
                  <code>propose_delete</code> return a payload with the planned change and a 5-row preview. The UI
                  renders a diff card; the human clicks Apply, which re-validates and runs through the audit-logged
                  proxy.
                </p>
                <p>
                  Bring your own OpenRouter API key on <Link href="/connections">Settings → AI</Link>. Tool-capable
                  models are tagged <code>tools</code> in the picker.
                </p>
              </section>

              <section id="rls">
                <h2>RLS debugger</h2>
                <p>
                  PostgREST hides <code>pg_policies</code> from anon / authenticated keys, so this page needs a direct
                  Postgres URL. Add one on the RLS page itself: the input renders as a setup card the first time you
                  open it.
                </p>
                <ul>
                  <li>
                    The policy browser groups every public-schema policy by table with USING and WITH CHECK clauses
                    formatted as code.
                  </li>
                  <li>
                    The simulator runs SELECT / INSERT / UPDATE / DELETE inside a transaction that always rolls back,
                    with the role and <code>request.jwt.claims</code> you pick. You see allow / deny + visible row count
                    per verb.
                  </li>
                </ul>
              </section>

              <section id="sql">
                <h2>SQL playground</h2>
                <p>
                  Same direct-Postgres credential as the RLS debugger. Read-only by default: every query runs inside{" "}
                  <code>BEGIN; SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = N; ...; ROLLBACK</code>, so a
                  rogue write is rejected by Postgres itself.
                </p>
                <p>
                  Write mode is a separate toggle behind a confirm dialog. Write-mode queries burn the same rate-limit
                  bucket as PostgREST writes and record an <code>audit_log</code> entry containing the SQL text.
                </p>
              </section>

              <section id="storage">
                <h2>Storage browser</h2>
                <p>
                  Two-pane layout: bucket list on the left, object browser on the right. Drag-drop upload (up to 50 MB
                  per file), multi-select bulk delete, per-object Sign button that copies a 1-hour signed URL, Copy
                  button for the public URL on public buckets.
                </p>
              </section>

              <section id="auth-users">
                <h2>Auth users</h2>
                <p>
                  Wraps Supabase's Admin API (<code>/auth/v1/admin/*</code>). Invite a new user, generate a recovery
                  link, ban / unban (one-year <code>ban_duration</code>), or delete. The whole page requires a{" "}
                  <code>service_role</code> key; with a lower-privilege key, the page renders a banner explaining
                  what to change.
                </p>
              </section>

              <section id="audit">
                <h2>Audit log</h2>
                <p>
                  Every write through the proxy writes a row to <code>audit_log</code>. Each row carries the user,
                  connection, table, primary key, verb, HTTP status, and (when available) snapshot columns.
                </p>
                <ul>
                  <li>The dashboard's <strong>Recent activity</strong> panel shows the last 10 entries with click-to-row navigation.</li>
                  <li>Each row detail page has a <strong>History</strong> panel that filters this table by primary key.</li>
                  <li>Diffs are computed against the previous entry's <code>afterRow</code> (or <code>beforeRow</code> for deletes).</li>
                </ul>
              </section>

            </Prose>

            <div className="mt-16 rounded-lg border hairline bg-bg-raised/40 p-5 text-sm">
              <p className="text-fg">Question not answered here?</p>
              <p className="mt-1 text-fg-muted">
                Email <a href="mailto:hello@suparbase.com" className="text-accent hover:underline">hello@suparbase.com</a> and we&apos;ll get back to you.
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
