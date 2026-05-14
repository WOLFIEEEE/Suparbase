import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Privacy · Suparbase",
  description:
    "What data Suparbase collects, what it does with it, and how to delete it.",
};

const LAST_UPDATED = "2026-05-14";

export default async function PrivacyPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Privacy"
          title="What we collect, why, and how to delete it."
          subtitle={`Last updated: ${LAST_UPDATED}. We are not lawyers; this is the plain-English summary. The same rules apply to self-hosters who run the open-source build for their own users.`}
        />
        <div className="mt-12 max-w-3xl">
          <Prose>
            <h2>The short version</h2>
            <p>
              Suparbase stores the absolute minimum required to do its job: your account, your saved Supabase
              connections, and an audit log of writes you perform. Your Supabase keys are AES-256-GCM encrypted before
              they ever touch a database row. They are never sent to a browser, never logged, and never read except
              inside a server-side proxy responding to one of your own requests.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Account</strong>: email address, hashed password (bcrypt), display name if you supplied one,
                and account creation / last-login timestamps. If you sign in via GitHub OAuth, we also store the OAuth
                provider id and avatar URL.
              </li>
              <li>
                <strong>Connections</strong>: the Supabase URL, hostname, role (derived from the JWT), and an
                AES-256-GCM ciphertext blob of the API key. Optionally a second ciphertext blob holding a direct
                Postgres connection string (used only by the RLS debugger and SQL playground).
              </li>
              <li>
                <strong>Audit log</strong>: per-write rows containing user id, connection id, schema name, table name,
                primary key, HTTP verb, status code, before/after row snapshots (when the upstream returned a
                representation), and a timestamp.
              </li>
              <li>
                <strong>AI usage</strong>: when you bring an OpenRouter key, we store an encrypted copy and the
                last-run token usage (prompt / completion / total). We do not retain conversation transcripts on the
                server; chat history lives in your browser memory only.
              </li>
              <li>
                <strong>Schema analysis cache</strong>: AI-generated table descriptions keyed by a SHA-256 fingerprint
                of your schema, so we don't spend tokens regenerating the same analysis.
              </li>
              <li>
                <strong>Operational logs</strong>: HTTP access logs at the hosting layer (timestamp, IP, path, status,
                user-agent), retained for 30 days. JWT-shaped substrings and Supabase keys are redacted before logs
                are written.
              </li>
            </ul>

            <h2>What we don&apos;t collect</h2>
            <ul>
              <li>
                Row data from your Supabase project. The proxy streams it through us; we never persist it.
              </li>
              <li>
                Plaintext API keys, passwords, or Postgres URLs. The only persisted form is encrypted.
              </li>
              <li>
                AI chat transcripts. They live in your browser tab and disappear when you close the panel.
              </li>
              <li>
                Marketing-grade analytics. No third-party trackers, no fingerprinting scripts, no behavioural
                cookies.
              </li>
            </ul>

            <h2>How we use what we collect</h2>
            <ul>
              <li>Your account exists so we can identify you across sessions.</li>
              <li>
                Connections exist so we can proxy your PostgREST / Storage / Auth-admin requests with the right key.
              </li>
              <li>
                The audit log exists so you can see who changed what, when, and (where captured) what changed.
              </li>
              <li>
                Operational logs exist so we can debug outages and detect abuse.
              </li>
            </ul>
            <p>
              We do not sell or rent any of the above. We do not share it with third parties except as listed in
              <em> Subprocessors</em> below.
            </p>

            <h2>Subprocessors</h2>
            <p>On the hosted plan, three vendors process data on our behalf:</p>
            <ul>
              <li>
                <strong>Postgres hosting</strong>: for Suparbase&apos;s own database (sessions, connections, audit log).
              </li>
              <li>
                <strong>Application hosting</strong>: for the Next.js app.
              </li>
              <li>
                <strong>Email</strong>: for password recovery and trial expiry notifications only. We send no
                marketing email.
              </li>
            </ul>
            <p>
              All three are GDPR-compatible and have signed our Data Processing Agreement. Self-hosters use their own
              infrastructure.
            </p>

            <h2>Encryption</h2>
            <p>
              Supabase keys and optional Postgres URLs are encrypted with AES-256-GCM using a key from
              <code>SUPARBASE_ENCRYPTION_KEY</code>. The plaintext exists only as a request-scoped variable inside
              the server during the few milliseconds of a proxied request, then it&apos;s discarded.
            </p>
            <p>
              Passwords (for email-and-password sign-ins) are hashed with bcrypt at cost 12. We never see your
              plaintext password and never email it to you.
            </p>

            <h2>Retention and deletion</h2>
            <ul>
              <li>
                You can delete any connection from <code>/connections</code> at any time. Doing so removes the encrypted
                key and cascades to any audit rows referencing it.
              </li>
              <li>
                You can export your data as JSON from your account settings (connections, audit log entries, saved
                views) before deleting.
              </li>
              <li>
                On cancellation of a hosted plan, your account is soft-deleted immediately and hard-deleted 30 days
                later, at which point all rows are removed from our database.
              </li>
            </ul>

            <h2>Cookies</h2>
            <p>
              We use one cookie: a signed, HTTP-only session cookie issued by NextAuth so you stay logged in. We do
              not use analytics or advertising cookies. We do not need a cookie banner because we do not need
              consent for the strictly-necessary session cookie.
            </p>

            <h2>Children</h2>
            <p>
              Suparbase is not intended for users under 16. We don&apos;t knowingly collect data from anyone under 16.
              If you believe a child has signed up, email us and we&apos;ll delete the account.
            </p>

            <h2>Your rights</h2>
            <p>
              Depending on where you live (GDPR, CCPA, and similar regimes apply), you have the right to access,
              correct, port, or delete your data, and to lodge a complaint with a data protection authority. The
              account settings page and the contact email below are the fastest path for all of these.
            </p>

            <h2>Changes to this policy</h2>
            <p>
              We update this page when the answers above change. The <em>Last updated</em> date at the top is
              authoritative. Material changes will be announced via email.
            </p>

            <h2>Contact</h2>
            <p>
              For anything privacy-related, email{" "}
              <a href="mailto:privacy@suparbase.dev">privacy@suparbase.dev</a>. For general support,{" "}
              <a href="mailto:hello@suparbase.dev">hello@suparbase.dev</a>.
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
