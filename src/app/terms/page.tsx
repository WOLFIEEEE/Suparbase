import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Terms · Suparbase",
  description: "The terms of service for Suparbase's hosted plan.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "2026-07-16";

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
              You&apos;re responsible for keeping your credentials safe. If your account is compromised, reach us
              immediately via <Link href="/contact?topic=security">our contact form</Link> (pick &ldquo;Security
              report&rdquo;). We won&apos;t reset your password from an email; we&apos;ll route a recovery flow
              through the in-app generate-link path.
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
              Hosted plans are billed in advance through Dodo Payments at the cadence and price shown during
              checkout. Dodo securely collects and manages payment details; Suparbase does not store full card
              numbers. You can manage the subscription, payment method, and invoices through the customer portal.
            </p>
            <p>
              The Hosted plan currently includes a seven-day trial. Unless the checkout page says otherwise, a
              payment method is required and billing begins when the trial ends. You may cancel before renewal;
              cancellation does not itself delete your account. Refunds are provided where required by law or where
              the checkout or customer portal expressly states that one applies.
            </p>

            <h3>5. Your data is yours</h3>
            <p>
              Routine reads from your Supabase project are proxied and are not stored as a separate copy by
              Suparbase. When you perform a write, the audit and undo features may retain the affected row&apos;s
              before-and-after snapshots. Account metadata, connection metadata, workspace configuration, and audit
              history are exportable as JSON from account settings. Secrets are deliberately excluded from exports.
            </p>

            <h3>6. Service availability</h3>
            <p>
              We monitor the hosted service and work to restore incidents promptly, but no uptime service-level
              agreement or automatic service credit applies unless it is included in a separate written agreement.
              Availability can also depend on Supabase, OpenRouter, Dodo Payments, and infrastructure you control.
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
              above, with email notice except in cases of imminent security harm. Billing cancellation returns the
              account to the applicable free entitlement after the paid period. Account deletion is a separate action
              in settings and uses the grace period shown there before permanent deletion.
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
              For questions about these terms, send a note via{" "}
              <Link href="/contact">our contact form</Link>. For everything else,
              same place.
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
