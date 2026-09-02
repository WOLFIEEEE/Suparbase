import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Privacy · Suparbase",
  description:
    "What data Suparbase collects, what it does with it, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "2026-07-16";

export default async function PrivacyPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Privacy"
          title="What we collect, why, and how to delete it."
          subtitle={`Last updated: ${LAST_UPDATED}. We are not lawyers; this is the plain-English summary.`}
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
                Postgres connection string used by explicitly-invoked database tools such as the RLS debugger, SQL
                playground, session undo, reports, watches, health checks, and database sync.
              </li>
              <li>
                <strong>Audit log</strong>: per-write rows containing user id, connection id, schema name, table name,
                primary key, HTTP verb, status code, before/after row snapshots (when the upstream returned a
                representation), and a timestamp.
              </li>
              <li>
                <strong>AI usage</strong>: when you bring an OpenRouter key, we store an encrypted copy and the
                last-run token usage (prompt / completion / total). We do not retain conversation transcripts in the
                Suparbase database. Up to 50 conversations per connection are stored in your browser&apos;s local
                storage so you can reopen them on that device.
              </li>
              <li>
                <strong>Schema analysis cache</strong>: AI-generated table descriptions keyed by a SHA-256 fingerprint
                of your schema, so we don't spend tokens regenerating the same analysis.
              </li>
              <li>
                <strong>Operational data</strong>: the application and hosting layer may process request timestamps,
                IP addresses, paths, status codes, and user agents to operate, secure, and debug the service. The
                application&apos;s structured logger redacts JWT-shaped values and common credential fields.
              </li>
            </ul>

            <h2>What we don&apos;t collect</h2>
            <ul>
              <li>
                A general-purpose copy of rows you read from your Supabase project. Routine reads are streamed through
                the proxy. When you make a change, however, the audit and undo features may store affected
                before-and-after row snapshots.
              </li>
              <li>
                Plaintext API keys, passwords, or Postgres URLs. The only persisted form is encrypted.
              </li>
              <li>
                Server-side AI chat transcripts. Local conversation history remains on the browser profile until you
                delete the conversation or clear the site&apos;s local storage.
              </li>
              <li>
                Full payment-card details. Checkout and payment management are handled by Dodo Payments.
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
                AI prompts, schema context, and aggregate results are sent to OpenRouter only when you use AI
                features. Row previews fetched by AI tools remain in the browser display and are excluded from the
                model payload.
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
            <p>
              The hosted service uses vendors in the following categories. Which optional vendors receive data
              depends on the features you enable:
            </p>
            <ul>
              <li>
                <strong>Application and Postgres hosting</strong>: to run Suparbase and store account, workspace, and
                audit data.
              </li>
              <li>
                <strong>Resend</strong>: to deliver verification, recovery, invitation, and service emails when email
                delivery is configured.
              </li>
              <li>
                <strong>Dodo Payments</strong>: to provide checkout, subscriptions, invoices, and the billing portal.
              </li>
              <li>
                <strong>OpenRouter</strong>: to process prompts and context when you choose to use AI features with
                your own API key.
              </li>
              <li>
                <strong>PostHog</strong>: optional product analytics, loaded only when the deployment operator
                configures a PostHog key. The integration respects Do Not Track and Global Privacy Control signals.
              </li>
              <li>
                <strong>GitHub</strong>: authentication data is exchanged with GitHub when you choose GitHub sign-in.
              </li>
            </ul>
            <p>
              Dedicated-deployment customers choose the infrastructure and subprocessors covered by their agreement.
              Contact us for the current hosted-service vendor details needed for a procurement or data-processing
              review.
            </p>

            <h2>Encryption</h2>
            <p>
              Supabase keys and optional Postgres URLs are encrypted with AES-256-GCM using a key from
              <code>SUPARBASE_ENCRYPTION_KEY</code>. The plaintext exists only as a request-scoped variable inside
              the server while it performs the operation you requested, then it&apos;s discarded.
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
                You can export your account, workspace configuration, audit history, and other associated records as
                JSON from account settings before deleting. Credentials, secret values, invitation tokens, and raw
                billing webhook payloads are excluded for security.
              </li>
              <li>
                Cancelling a hosted subscription does not delete your account. You may separately schedule account
                deletion in settings. That action signs you out and starts a 30-day grace period before permanent
                deletion; the UI provides a way to cancel the deletion during the grace period.
              </li>
            </ul>

            <h2>Cookies</h2>
            <p>
              We use strictly necessary authentication cookies to keep you signed in and, when enabled, remember a
              completed two-factor challenge for the current login session. If the deployment operator enables
              PostHog, it may use local storage and an analytics cookie; that integration is disabled for Do Not
              Track or Global Privacy Control signals. Hosted deployments must present any consent controls required
              by the law that applies to the visitor.
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
              For anything privacy-related, send a note via{" "}
              <Link href="/contact">our contact form</Link>. For general
              support, same place.
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
