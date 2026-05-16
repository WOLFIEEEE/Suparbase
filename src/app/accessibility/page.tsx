import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Accessibility · Suparbase",
  description:
    "Suparbase's accessibility statement: target standard, what we ship today, known gaps, and how to report issues.",
};

const LAST_UPDATED = "2026-05-15"; // WCAG 2.2 alignment + v3.5.1 UI hardening pass

/**
 * Plain-English accessibility statement. Companion document to the
 * VPAT 2.5 Rev (at /accessibility/vpat). Designed to be readable by
 * a customer — not a procurement-grade conformance report. Honest
 * about what's solid and what's still partial.
 */
export default async function AccessibilityPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Accessibility"
          title="The shape we're in, in plain English."
          subtitle={`Last updated ${LAST_UPDATED}. We aim for WCAG 2.2 Level AA across every authenticated page and every public marketing page. We're close but not perfect — this page is honest about both.`}
        />
        <div className="mt-12 max-w-3xl">
          <Prose>
            <h2>The standard we target</h2>
            <p>
              <strong>WCAG 2.2 Level AA</strong> across the entire product surface — the
              marketing site, the sign-in flow, the connections workspace, the data grid,
              the AI chat, the SQL playground, the admin panel, and the billing pages.
              The detailed conformance posture against every relevant criterion lives in
              our <Link href="/accessibility/vpat">VPAT 2.5 Rev</Link>, which is the
              document procurement officers ask for.
            </p>

            <h2>What works well today</h2>
            <ul>
              <li>
                <strong>Keyboard navigation</strong> reaches every interactive control.
                We use semantic <code>&lt;button&gt;</code>, <code>&lt;a&gt;</code>, and
                native form elements throughout — there are no click-only
                <code>&lt;div&gt;</code>s.
              </li>
              <li>
                <strong>Focus is always visible</strong>. A 2px accent-coloured ring on
                <code>:focus-visible</code> follows every interactive element, with
                explicit ring styling on dialogs, dropdowns, and form controls.
              </li>
              <li>
                <strong>Skip-to-content link</strong> on every page — tab once from the
                address bar to jump past the header and nav.
              </li>
              <li>
                <strong>Modals, menus, and tooltips</strong> are built on Radix UI
                primitives, which ship with focus traps, escape handling, focus return,
                and correct ARIA roles by default.
              </li>
              <li>
                <strong>Form fields</strong> have visible labels, programmatic label
                association, inline error messages with <code>role=&quot;alert&quot;</code>,
                <code>aria-invalid</code> on bad fields, and
                <code>aria-describedby</code> linking the field to its hint.
              </li>
              <li>
                <strong>Autocomplete hints</strong> on every email, password, and URL
                field, so password managers and browsers can fill correctly.
              </li>
              <li>
                <strong>Reduced motion</strong> is honoured. Page transitions, footer
                particles, and the landing hero animations all disable when the user has
                <code> prefers-reduced-motion: reduce</code> set.
              </li>
              <li>
                <strong>Dark + light themes</strong> with high-contrast text
                (≈18:1 for primary text in both modes) and explicit
                <code> prefers-color-scheme</code> fallback.
              </li>
              <li>
                <strong>Text resizing</strong> to 200% works without horizontal scroll
                or content cut-off — all sizing uses relative units.
              </li>
              <li>
                <strong>Screen-reader announcements</strong> for toast notifications and
                AI chat output, via <code>aria-live</code> regions.
              </li>
              <li>
                <strong>Language of page</strong> declared on the root
                <code> &lt;html lang=&quot;en&quot;&gt;</code>.
              </li>
              <li>
                <strong>Accessible authentication</strong>: no cognitive function
                tests (no CAPTCHAs requiring puzzle-solving). Sign-in uses email +
                password with browser autocomplete, or GitHub OAuth.
                <em> (WCAG 2.2 — 3.3.8)</em>
              </li>
              <li>
                <strong>No drag-only interactions</strong>: every action that uses
                pointer movement (selection, navigation, editing) has a click or
                keyboard equivalent.
                <em> (WCAG 2.2 — 2.5.7)</em>
              </li>
              <li>
                <strong>Redundant entry avoided</strong>: forms don&apos;t ask
                users to re-enter information already supplied earlier in the
                same flow.
                <em> (WCAG 2.2 — 3.3.7)</em>
              </li>
            </ul>

            <h2>Where we&apos;re still partial</h2>
            <p>
              These are real gaps we&apos;ve audited and are tracking. They&apos;re
              listed in the VPAT as &quot;Partially Supports&quot; with the same notes
              you&apos;ll see here.
            </p>
            <ul>
              <li>
                <strong>Color contrast for de-emphasised text</strong>: our smallest
                helper text uses a faint-foreground token (≈3.5–3.9:1 against the
                background) which is below the 4.5:1 minimum for normal body text. It
                only appears in microcopy / eyebrow labels. We&apos;ll darken this token
                in a future design pass.
              </li>
              <li>
                <strong>Non-text contrast on resting borders</strong>: input field
                outlines at rest are a hairline (≈1.5–1.7:1) and only meet the 3:1
                threshold on focus / hover. Visible enough in practice; below spec on
                paper.
              </li>
              <li>
                <strong>Table headers on marketing comparison pages</strong>: a handful
                of comparison and pricing tables omit <code>scope=&quot;col&quot;</code>
                on header cells. Auto-association usually works for simple tables but
                we&apos;ll add the attribute explicitly.
              </li>
              <li>
                <strong>Loading-state announcements</strong>: route-level skeleton
                loaders and the &quot;Refreshing schema&quot; spinner don&apos;t
                announce a busy state. Form submit and toast feedback is announced.
              </li>
              <li>
                <strong>Color-contrast verification</strong>: ratios above were
                computed by inspecting our CSS custom properties, not measured with an
                automated tool like axe-core or Lighthouse. We plan to do a measured
                run before each release; if you&apos;re relying on this for
                procurement, please run your own audit against the live site.
              </li>
              <li>
                <strong>Target sizes (WCAG 2.2 — 2.5.8)</strong>: a few
                secondary controls (filter-chip remove, inline-edit confirm /
                cancel icons, password-eye toggle) sit slightly below the 24×24
                CSS-pixel minimum. Primary actions (sign-in, save, delete
                buttons) clear it. The small controls always have a larger
                keyboard or pointer alternative; we&apos;re tracking enlargement
                in a follow-up design pass.
              </li>
              <li>
                <strong>Help link consistency (WCAG 2.2 — 3.2.6)</strong>: the
                contact email (<code>contact@suparbase.com</code>) and docs link
                appear on most surfaces but not yet uniformly in the same
                screen position. A future header pass will normalise this.
              </li>
            </ul>

            <h2>What doesn&apos;t apply</h2>
            <p>
              Suparbase doesn&apos;t ship any audio, video, captions, audio
              descriptions, or time-based media. The WCAG criteria covering those are
              marked &quot;Not Applicable&quot; in our VPAT.
            </p>

            <h2>How to report an issue</h2>
            <p>
              If you hit an accessibility problem — anything from &quot;this contrast
              is too low&quot; to &quot;my screen reader can&apos;t find the submit
              button&quot; — please email{" "}
              <a href="mailto:contact@suparbase.com">contact@suparbase.com</a>.
              We aim to acknowledge within two business days and ship a fix within ten
              for anything below WCAG 2.2 AA. Include:
            </p>
            <ul>
              <li>The page or flow where you saw the issue (URL is great).</li>
              <li>The assistive technology you&apos;re using (screen reader + version,
              keyboard-only, etc.).</li>
              <li>What you expected vs. what happened.</li>
            </ul>

            <h2>Assistive technologies we&apos;ve tested with</h2>
            <p>
              Code-level review against WCAG 2.2 AA across every major page. Live
              testing has been spot-check rather than systematic — primarily VoiceOver
              on macOS with Safari and keyboard-only navigation across all flows.
              Customers using NVDA, JAWS, TalkBack, or VoiceOver on iOS may notice
              gaps we haven&apos;t caught; please report them.
            </p>

            <h2>Conformance status</h2>
            <p>
              <strong>Partially conformant with WCAG 2.2 Level AA.</strong> Most
              criteria are fully supported; a few are partial (see above), one is not
              supported only in the trivial sense that nothing applies (no media). The
              <Link href="/accessibility/vpat"> VPAT 2.5</Link> has the full criterion-
              by-criterion breakdown.
            </p>

            <h2>Document references</h2>
            <p>
              <Link
                href="/accessibility/vpat"
                className="inline-flex items-center gap-1"
              >
                VPAT 2.5 Rev (full conformance report)
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
              <br />
              <a
                href="https://www.w3.org/TR/WCAG22/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                WCAG 2.2 specification
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
              <br />
              <a
                href="https://www.section508.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                Section 508 (US federal accessibility standard)
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
              <br />
              <a
                href="https://www.itic.org/policy/accessibility/vpat"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                VPAT 2.5 template (ITI Council)
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            </p>
          </Prose>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
