import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Terms · Suparbase",
  description: "The terms of service for Suparbase's hosted plan.",
};

const LAST_UPDATED = "2026-05-14";

export default async function TermsPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Terms"
          title="The agreement, in plain English."
          subtitle={`Last updated: ${LAST_UPDATED}. We aren't lawyers; if you need formal terms for a procurement process, email us and we'll send the long version.`}
        />
        <div className="mt-12 max-w-3xl">
          <Prose>
            <h2>Hosted plan</h2>
            <p>
              When you sign up at <a href="https://suparbase.com">suparbase.com</a> and use the hosted version, the
              terms below apply. By creating an account you agree to them.
            </p>

            <h3>1. The service</h3>
            <p>
              We host and operate Suparbase for you. The product is proprietary software offered on a free hosted
              tier (with paid plans for higher limits and team features).
            </p>

            <h3>2. Your account</h3>
            <p>
              You&apos;re responsible for keeping your credentials safe. If your account is compromised, email us
              immediately at <a href="mailto:security@suparbase.com">security@suparbase.com</a>. We won&apos;t reset
              your password from an email; we&apos;ll route a recovery flow through the in-app generate-link path.
            </p>

            <h3>3. Acceptable use</h3>
            <p>You may not use Suparbase to:</p>
            <ul>
              <li>Operate against a Supabase project you don&apos;t own or have explicit permission to operate against.</li>
              <li>Run automated load tests we haven&apos;t agreed to in writing.</li>
              <li>Store data that violates the law of any jurisdiction you or we operate in.</li>
              <li>Spam, phish, or distribute malware via the auth-users invite flow.</li>
              <li>
                Reverse-engineer the hosted service, scrape it, or attempt to extract another tenant&apos;s data.
              </li>
            </ul>

            <h3>4. Payment and refunds</h3>
            <p>
              The hosted plan is monthly, per active user, billed at the start of each cycle. You can downgrade or
              cancel at any time from your account settings; cancellation is prorated for the rest of the month and
              refunded.
            </p>
            <p>
              The 14-day free trial does not require a credit card. After the trial expires we&apos;ll email you; if
              no card is on file the account moves to a read-only state for 30 days, then we hard-delete it.
            </p>

            <h3>5. Your data is yours</h3>
            <p>
              Your Supabase data is not our data: we never persist row contents, only proxy them. The data that is
              ours-but-yours (account, connections, audit log) is exportable as JSON from your account page at any
              time. On cancellation we hard-delete it after 30 days.
            </p>

            <h3>6. Service availability</h3>
            <p>
              We aim for 99.5% monthly uptime on the hosted plan. If we miss that in any given calendar month and
              you ask, we&apos;ll credit the next month proportionally. Outages caused by Supabase, OpenRouter, or
              your own infrastructure are not counted.
            </p>

            <h3>7. Warranties</h3>
            <p>
              We provide the hosted service &quot;as is&quot;. We don&apos;t warrant that the service will be
              uninterrupted, error-free, or perfectly secure: we operate it carefully and patch quickly when
              issues arise, but software is software.
            </p>

            <h3>8. Limitation of liability</h3>
            <p>
              To the extent the law allows, our total liability for any claim arising from your use of the hosted
              service is capped at what you paid us in the previous twelve months. We&apos;re not liable for
              indirect, incidental, or consequential damages.
            </p>

            <h3>9. Termination</h3>
            <p>
              You may cancel at any time. We may suspend or terminate accounts that violate the acceptable-use rules
              above, with email notice except in cases of imminent security harm.
            </p>

            <h3>10. Changes</h3>
            <p>
              We update these terms when the answers above change. Material changes will be announced via email at
              least 30 days before they take effect.
            </p>

            <h3>11. Governing law</h3>
            <p>
              These terms are governed by the laws of the operator&apos;s jurisdiction, exclusive of conflict-of-law
              rules. Disputes that can&apos;t be resolved by email go to the courts of that jurisdiction.
            </p>

            <h2>Contact</h2>
            <p>
              For questions about these terms, email{" "}
              <a href="mailto:legal@suparbase.com">legal@suparbase.com</a>. For everything else,{" "}
              <a href="mailto:hello@suparbase.com">hello@suparbase.com</a>.
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
