import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "API · Suparbase",
  description:
    "REST endpoints customers and operators can script against - account, billing, health, and admin search.",
};

/**
 * Public REST API reference. Limited to endpoints that survive
 * across releases and require only standard cookie-session auth.
 *
 * We deliberately don't publish every internal route - `/api/v/...`
 * (the encrypted proxy), `/api/connections/.../widgets/run`, and
 * similar are tied to the UI's workflow rather than a stable
 * external contract. They MAY be called by power users but
 * shouldn't be considered part of the supported surface.
 */
export default async function ApiDocsPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="API"
          title="Programmatic surface."
          subtitle="The endpoints we'll keep stable across versions. Auth is the same session cookie the UI uses - sign in with curl + browser dev tools, or use one of the documented `Authorization` headers below."
        />
        <div className="mt-12 max-w-3xl">
          <Prose>
            <h2>Authentication</h2>
            <p>
              All endpoints below require an authenticated browser session via
              the <code>authjs.session-token</code> (or
              <code> __Secure-authjs.session-token</code> in production) cookie.
              The simplest way to use them from a script:
            </p>
            <ol>
              <li>Sign in via the browser at <Link href="/signin">/signin</Link>.</li>
              <li>Copy the session cookie value from the dev tools.</li>
              <li>
                Send it with each request via <code>Cookie: authjs.session-token=…</code>.
              </li>
            </ol>
            <p>
              The session cookie is <code>httpOnly</code>, so it cannot be
              accessed from page JavaScript - that&apos;s by design. There is no
              long-lived API token yet; if you have a use case that needs one,
              send us a note via{" "}
              <Link href="/contact">our contact form</Link>.
            </p>

            <h2>CSRF</h2>
            <p>
              Any <code>POST</code> / <code>PUT</code> / <code>PATCH</code> /
              <code> DELETE</code> request must either have no <code>Origin</code>{" "}
              header (server-to-server) or carry an <code>Origin</code> that
              matches the deployment host. Cross-site origins are rejected with
              <code> 403 forbidden</code> at the middleware. Webhooks (
              <code>/api/webhooks/*</code>) are exempt because they
              authenticate via HMAC signature instead.
            </p>

            <h2>Account</h2>
            <h3>
              <code>POST /api/account/forgot-password</code>
            </h3>
            <p>
              Trigger a password-reset email. Body <code>{`{ email: string }`}</code>.
              Always returns <code>200 {`{ ok: true, configured: boolean }`}</code>
              enumeration-resistant. <code>configured: false</code> means email
              isn&apos;t wired on this deployment.
            </p>

            <h3>
              <code>POST /api/account/reset-password</code>
            </h3>
            <p>
              Consume a reset token. Body <code>{`{ token: string, password: string }`}</code>.
              <code> 200</code> on success, <code>410</code> when the token has
              expired, <code>409</code> when the token has already been
              consumed, <code>404</code> when unknown.
            </p>

            <h3>
              <code>POST /api/account/change-password</code>
            </h3>
            <p>
              Rotate password while signed in. Body
              <code> {`{ currentPassword, newPassword }`}</code>. Returns
              <code> 200</code> on success, <code>400</code> when the current
              password doesn&apos;t match, <code>409</code> for OAuth-only
              accounts (no password to change).
            </p>

            <h3>
              <code>POST /api/account/verify-email/start</code>
            </h3>
            <p>
              Re-send the email-verification link to the current user. Body
              empty. <code>200</code>.
            </p>

            <h3>
              <code>POST /api/account/verify-email/confirm</code>
            </h3>
            <p>
              Consume a verification token. Body <code>{`{ token: string }`}</code>.
              <code> 200</code> / <code>410</code> / <code>409</code> /
              <code> 404</code>.
            </p>

            <h3>
              <code>GET /api/account/export</code>
            </h3>
            <p>
              GDPR data portability. Returns the signed-in user&apos;s full
              dataset as a single JSON file with{" "}
              <code>Content-Disposition: attachment</code>. Encrypted columns
              (Supabase keys, Postgres URL, TOTP secret) are excluded.
            </p>

            <h3>
              <code>POST /api/account/2fa/{`{setup,enable,verify,disable}`}</code>
            </h3>
            <p>
              The four-step 2FA lifecycle. See{" "}
              <Link href="/settings/account/2fa">/settings/account/2fa</Link> for
              the wired UI; the API contracts are: <code>setup</code> returns a
              fresh secret + QR data URL; <code>enable</code> takes{" "}
              <code>{`{ secret, code }`}</code> and persists; <code>verify</code>{" "}
              takes <code>{`{ code, recovery? }`}</code> and sets the MFA cookie;
              <code> disable</code> takes <code>{`{ password }`}</code> and clears.
            </p>

            <h2>Billing</h2>
            <h3>
              <code>POST /api/billing/checkout</code>
            </h3>
            <p>
              Kick off a Dodo hosted checkout. Body empty. Returns
              <code> {`{ checkoutUrl: string }`}</code>: the client navigates to it.
              <code> 409</code> when the user already has an active subscription;
              <code> 503</code> when billing isn&apos;t configured.
            </p>

            <h3>
              <code>POST /api/billing/portal</code>
            </h3>
            <p>
              Mint a Dodo customer-portal URL. Returns
              <code> {`{ url: string }`}</code>. <code>404</code> when the user
              has no Dodo customer record yet.
            </p>

            <h3>
              <code>POST /api/webhooks/dodo</code>
            </h3>
            <p>
              Inbound Standard Webhooks endpoint. Verified by HMAC-SHA256 over
              <code> {`${"`"}\${webhook-id}.\${webhook-timestamp}.\${rawBody}${"`"}`}</code> using{" "}
              <code>DODO_WEBHOOK_SECRET</code>. 5-minute replay tolerance.
              Idempotent via <code>billing_event.webhook_id</code> +{" "}
              <code>applied_at</code>.
            </p>

            <h2>Operational</h2>
            <h3>
              <code>GET /api/health</code>
            </h3>
            <p>
              Liveness + readiness. Returns <code>200</code> when the database
              is reachable, <code>503</code> when not. Body shape:
            </p>
            <pre>
              <code>{`{
  "status": "ok" | "degraded",
  "db": boolean,
  "email": boolean,
  "billing": boolean,
  "observability": boolean,
  "version": "3.x.y"
}`}</code>
            </pre>

            <h3>
              <code>POST /api/cron/retention</code>
            </h3>
            <p>
              Manual trigger for audit-log + sentry-finding retention. Requires{" "}
              <code>Authorization: Bearer {`<CRON_SECRET>`}</code>. Returns the
              row counts pruned per table. Designed for cron-job.org / Coolify
              cron / GitHub Actions - not for in-app calls.
            </p>

            <h2>What's NOT public yet</h2>
            <p>
              The following exist and work, but their shape may change without
              notice - script against them at your own risk:
            </p>
            <ul>
              <li>
                <code>/api/v/{`<id>`}/*</code>: the encrypted proxy. The
                contract follows{" "}
                <a
                  href="https://postgrest.org/en/stable/api.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  PostgREST&apos;s
                </a>{" "}
                under the hood, but our auth + filtering layer wraps it.
              </li>
              <li>
                <code>/api/connections/{`<id>`}/sentry/*</code>: Agent Sentry
                scans + findings + quarantines.
              </li>
              <li>
                <code>/api/connections/{`<id>`}/sessions/*</code>: agent
                sessions + one-click undo.
              </li>
              <li>
                <code>/api/connections/{`<id>`}/{`{widgets,actions,members}`}/*</code>
                tied closely to the UI; expect shape changes.
              </li>
              <li>
                <code>/api/ai/*</code>: AI chat conversations + analysis.
              </li>
            </ul>
            <p>
              If you need a stable contract on any of these, let us know via{" "}
              <Link href="/contact">our contact form</Link>
              {" "}- we&apos;ll publish it here once we know it&apos;s worth
              keeping stable.
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
