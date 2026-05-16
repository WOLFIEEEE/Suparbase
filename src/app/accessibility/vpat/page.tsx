import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "VPAT 2.5 · Suparbase",
  description:
    "Voluntary Product Accessibility Template (VPAT) 2.5 Rev for Suparbase — conformance against WCAG 2.2 Level AA.",
};

const REPORT_DATE = "2026-05-15";
const PRODUCT_VERSION = "v3.5.1";
const VENDOR_CONTACT = "contact@suparbase.com";

type Conformance =
  | "Supports"
  | "Partially Supports"
  | "Does Not Support"
  | "Not Applicable";

interface Criterion {
  id: string;
  name: string;
  conformance: Conformance;
  remarks: string;
}

/**
 * Conformance levels per WCAG 2.2 Level AA. Drawn from the
 * accessibility audit at /Users/khushwantparihar/Suparbase against
 * the actual code on `main`, not aspirational. When the audit
 * couldn't verify (e.g., contrast measured by eye, not by tool), the
 * remark says so.
 */
const WCAG_AA: Criterion[] = [
  // Sorted by criterion number. WCAG 2.2-new criteria are noted in
  // their remarks. Level A criteria are listed first, then AA.
  // 4.1.1 Parsing is obsolete in WCAG 2.2 and omitted here.
  {
    id: "1.1.1",
    name: "Non-text Content (Level A)",
    conformance: "Supports",
    remarks:
      "All decorative icons (lucide-react) carry aria-hidden. Icon-only buttons (password toggle, navigation menu, row actions, dialog close, etc.) have aria-label. Avatar <img> elements use empty alt because the user's name is rendered alongside.",
  },
  {
    id: "1.2.1",
    name: "Audio-only and Video-only (Prerecorded) (Level A)",
    conformance: "Not Applicable",
    remarks: "No audio or video content is shipped.",
  },
  {
    id: "1.2.2",
    name: "Captions (Prerecorded) (Level A)",
    conformance: "Not Applicable",
    remarks: "No prerecorded video content with audio.",
  },
  {
    id: "1.2.3",
    name: "Audio Description or Media Alternative (Prerecorded) (Level A)",
    conformance: "Not Applicable",
    remarks: "No prerecorded video content.",
  },
  {
    id: "1.2.4",
    name: "Captions (Live) (Level AA)",
    conformance: "Not Applicable",
    remarks: "No live audio content.",
  },
  {
    id: "1.2.5",
    name: "Audio Description (Prerecorded) (Level AA)",
    conformance: "Not Applicable",
    remarks: "No prerecorded video content.",
  },
  {
    id: "1.3.1",
    name: "Info and Relationships (Level A)",
    conformance: "Partially Supports",
    remarks:
      "Most forms (sign-in, sign-up, connection form, bulk-delete, row form, AI settings, team invite, action editor) use programmatic label association via htmlFor/id pairs or wrapping <label> elements. As of v3.5.0 the previously-bare labels in TeamMembers, ActionsManager Field helper, and EditableField inline editor were patched. A small set of comparison/pricing/admin tables on marketing pages omit scope=\"col\" on header cells — implicit association usually works for simple tables but is implementation-defined. Lists, headings, and landmarks (<nav>, <main>, <header>, <footer>, <aside>) are used semantically.",
  },
  {
    id: "1.3.2",
    name: "Meaningful Sequence (Level A)",
    conformance: "Supports",
    remarks: "DOM order matches visual order; no CSS reordering creates traversal inconsistencies. Verified across audit.",
  },
  {
    id: "1.3.3",
    name: "Sensory Characteristics (Level A)",
    conformance: "Supports",
    remarks: "Instructions don't rely solely on color, shape, size, or position. Errors carry icon + text + role=\"alert\".",
  },
  {
    id: "1.3.4",
    name: "Orientation (Level AA)",
    conformance: "Supports",
    remarks: "Layout works in portrait and landscape; no orientation is forced.",
  },
  {
    id: "1.3.5",
    name: "Identify Input Purpose (Level AA)",
    conformance: "Supports",
    remarks:
      "Auth forms set autoComplete=email/current-password/new-password/name. Connection form sets autoComplete=url and inputMode=url for project URL, autoComplete=off for secrets.",
  },
  {
    id: "1.4.1",
    name: "Use of Color (Level A)",
    conformance: "Supports",
    remarks: "Color is never the sole information carrier. Errors pair red with icons + text; required fields use icon + helper text; status chips use both color and label.",
  },
  {
    id: "1.4.2",
    name: "Audio Control (Level A)",
    conformance: "Not Applicable",
    remarks: "No auto-playing audio.",
  },
  {
    id: "1.4.3",
    name: "Contrast (Minimum) (Level AA)",
    conformance: "Partially Supports",
    remarks:
      "Primary text in both light and dark modes is ≈18:1 against the background. Muted text ≈8.5–9.5:1. Accent and danger tokens clear 4.5:1. The faint-foreground token used for microcopy / eyebrow labels is ≈3.5–3.9:1 — below the 4.5:1 minimum for normal text. A design pass to darken this token is queued. Ratios were computed by inspection of CSS tokens, not measured with axe-core / Lighthouse; customers should run their own automated audit for procurement-grade verification.",
  },
  {
    id: "1.4.4",
    name: "Resize Text (Level AA)",
    conformance: "Supports",
    remarks: "All sizing uses rem/em via Tailwind utilities. Display sizes use clamp(). No px-pinned text. Text reflows correctly at 200% zoom.",
  },
  {
    id: "1.4.5",
    name: "Images of Text (Level AA)",
    conformance: "Supports",
    remarks: "Text is rendered as text. No images of text anywhere in the product.",
  },
  {
    id: "1.4.10",
    name: "Reflow (Level AA)",
    conformance: "Supports",
    remarks: "Responsive across breakpoints (sm/md/lg). Workspace switches to single-column + slide-out nav under md. No 2-D scrolling required at 320 CSS pixels.",
  },
  {
    id: "1.4.11",
    name: "Non-text Contrast (Level AA)",
    conformance: "Partially Supports",
    remarks:
      "Focus rings (2px solid accent + 2px offset) and accent buttons clear 3:1. Input/card resting borders are intentionally hairline (≈1.5–1.7:1) — they meet 3:1 only on focus / hover. Compensated by strong focus states; acknowledged below spec on resting state.",
  },
  {
    id: "1.4.12",
    name: "Text Spacing (Level AA)",
    conformance: "Supports",
    remarks: "No fixed letter-spacing / word-spacing / line-height in px. Containers don't clip text under user-overridden spacing.",
  },
  {
    id: "1.4.13",
    name: "Content on Hover or Focus (Level AA)",
    conformance: "Supports",
    remarks:
      "Radix Tooltip is dismissible (Escape), hoverable, persistent. As of v3.5.0 the two remaining title=\"...\" attributes (SignInForm \"Forgot?\", Topbar \"Refresh schema\") were replaced with Radix Tooltip instances.",
  },
  {
    id: "2.1.1",
    name: "Keyboard (Level A)",
    conformance: "Supports",
    remarks: "Every interactive element is a <button>, <a>/<Link>, Radix primitive, or native form control. No click-only divs. Inline-edit fields commit on Enter / cancel on Escape.",
  },
  {
    id: "2.1.2",
    name: "No Keyboard Trap (Level A)",
    conformance: "Supports",
    remarks: "All modal flows go through Radix Dialog / DropdownMenu / Popover with focus traps + Escape exits. No custom traps.",
  },
  {
    id: "2.1.4",
    name: "Character Key Shortcuts (Level A)",
    conformance: "Supports",
    remarks: "Cmd/Ctrl-K opens the command palette. No single-character shortcuts that activate without a modifier.",
  },
  {
    id: "2.2.1",
    name: "Timing Adjustable (Level A)",
    conformance: "Not Applicable",
    remarks: "No time limits on user activity. Session cookies follow standard NextAuth lifetime; sign-out is explicit.",
  },
  {
    id: "2.2.2",
    name: "Pause, Stop, Hide (Level A)",
    conformance: "Supports",
    remarks: "Decorative motion (footer drifting particles, hero animations) respects prefers-reduced-motion. Spinners are short-lived (loading states); no auto-updating content the user cannot pause.",
  },
  {
    id: "2.3.1",
    name: "Three Flashes or Below Threshold (Level A)",
    conformance: "Supports",
    remarks: "No flashing content.",
  },
  {
    id: "2.4.1",
    name: "Bypass Blocks (Level A)",
    conformance: "Supports",
    remarks: "As of v3.5.0, a \"Skip to content\" link is the first focusable element on every page; it jumps to the <main id=\"main\"> landmark in each layout (public, account, workspace, admin, auth shell).",
  },
  {
    id: "2.4.2",
    name: "Page Titled (Level A)",
    conformance: "Supports",
    remarks: "Every route exports a <title> via Next.js metadata; template appends \"· Suparbase\".",
  },
  {
    id: "2.4.3",
    name: "Focus Order (Level A)",
    conformance: "Supports",
    remarks: "DOM order matches visual order. Modals open with focus on first focusable child; dropdowns return focus to trigger on close (Radix defaults).",
  },
  {
    id: "2.4.4",
    name: "Link Purpose (In Context) (Level A)",
    conformance: "Supports",
    remarks: "Links use descriptive text or carry aria-label when icon-only (\"Suparbase home\", \"Connection settings\", \"Open row {value}\", etc.).",
  },
  {
    id: "2.4.5",
    name: "Multiple Ways (Level AA)",
    conformance: "Supports",
    remarks: "Pages are reachable via the primary nav, sitemap (/sitemap.xml), site search (Cmd-K command palette inside the workspace), and explicit links from related pages (blog → use cases → features → pricing, etc.).",
  },
  {
    id: "2.4.6",
    name: "Headings and Labels (Level AA)",
    conformance: "Supports",
    remarks: "Pages have exactly one <h1> via PageHeader. Section headings step down logically. Form labels are descriptive (no \"Field 1\" patterns).",
  },
  {
    id: "2.4.7",
    name: "Focus Visible (Level AA)",
    conformance: "Supports",
    remarks: "Global :focus-visible outline (2px solid accent, 2px offset). Radix wrappers add focus-visible:ring-2 ring-accent. As of v3.5.1 the Button component carries an explicit focus-visible ring (previously its base class disabled the outline without adding a replacement). Initially-hidden controls (e.g., row hover-only actions) reveal on keyboard focus.",
  },
  {
    id: "2.4.11",
    name: "Focus Not Obscured (Minimum) (Level AA) [WCAG 2.2]",
    conformance: "Supports",
    remarks: "The sticky workspace topbar reserves the top edge of the viewport, but focused interactive elements are not obscured because the browser's scrollIntoView default brings them below the topbar. No custom CSS forces a focused element behind another layer.",
  },
  {
    id: "2.5.1",
    name: "Pointer Gestures (Level A)",
    conformance: "Supports",
    remarks: "No drag-only or multi-finger gestures. All actions are reachable via single-pointer taps or clicks.",
  },
  {
    id: "2.5.2",
    name: "Pointer Cancellation (Level A)",
    conformance: "Supports",
    remarks: "Buttons activate on pointerup (browser default), not pointerdown. No custom pointer handling that would defeat cancellation by dragging off.",
  },
  {
    id: "2.5.3",
    name: "Label in Name (Level A)",
    conformance: "Supports",
    remarks: "Visible text matches accessible name (e.g., \"Sign in\" button's aria-name is \"Sign in\"). Icon-only buttons' aria-labels match tooltip text.",
  },
  {
    id: "2.5.4",
    name: "Motion Actuation (Level A)",
    conformance: "Not Applicable",
    remarks: "No motion-based activation (no shake-to-undo, no tilt gestures).",
  },
  {
    id: "2.5.7",
    name: "Dragging Movements (Level AA) [WCAG 2.2]",
    conformance: "Supports",
    remarks: "No primary functionality requires a drag gesture. Selection, sorting, and reordering all have click or keyboard equivalents (Radix Select, Dropdown, native checkboxes).",
  },
  {
    id: "2.5.8",
    name: "Target Size (Minimum) (Level AA) [WCAG 2.2]",
    conformance: "Partially Supports",
    remarks: "Primary action buttons (sign-in, save, delete, upgrade) are well above the 24×24 CSS-pixel minimum. A few secondary controls — filter-chip remove (≈16×16 with p-0.5), inline-edit confirm / cancel icon buttons (h-3 w-3 + small padding), password-eye toggle — fall below. All affected controls have a larger keyboard or pointer alternative, but the targets themselves don't pass 2.5.8 in isolation. Tracked for a follow-up design pass.",
  },
  {
    id: "3.1.1",
    name: "Language of Page (Level A)",
    conformance: "Supports",
    remarks: "<html lang=\"en\"> on root layout. No alternate-language content shipped.",
  },
  {
    id: "3.1.2",
    name: "Language of Parts (Level AA)",
    conformance: "Not Applicable",
    remarks: "All content is English.",
  },
  {
    id: "3.2.1",
    name: "On Focus (Level A)",
    conformance: "Supports",
    remarks: "Focus events never navigate, submit, or change context. Tooltips opening on focus are permitted (dismissible per Radix).",
  },
  {
    id: "3.2.2",
    name: "On Input (Level A)",
    conformance: "Supports",
    remarks: "Inputs never navigate or submit on change. Forms require explicit submit-button activation.",
  },
  {
    id: "3.2.3",
    name: "Consistent Navigation (Level AA)",
    conformance: "Supports",
    remarks: "Primary nav, footer, and workspace sidebar are consistent across pages.",
  },
  {
    id: "3.2.4",
    name: "Consistent Identification (Level AA)",
    conformance: "Supports",
    remarks: "Reused components (delete button, edit button, status chips, plan pills) are identified consistently across the product.",
  },
  {
    id: "3.2.6",
    name: "Consistent Help (Level A) [WCAG 2.2]",
    conformance: "Partially Supports",
    remarks: "Help contact (contact@suparbase.com, contact@suparbase.com) and a docs link appear on most pages but in slightly different positions (footer vs in-page callout vs nav menu). The contact information itself is consistent; the screen location is being normalised in a follow-up header pass.",
  },
  {
    id: "3.3.1",
    name: "Error Identification (Level A)",
    conformance: "Supports",
    remarks: "Form-level errors render with role=\"alert\" and an icon. Field-level errors set aria-invalid and link via aria-describedby to the inline message.",
  },
  {
    id: "3.3.2",
    name: "Labels or Instructions (Level A)",
    conformance: "Supports",
    remarks: "Forms include label + explanatory hint where the format is non-obvious. As of v3.5.0 the previously-bare labels were patched.",
  },
  {
    id: "3.3.3",
    name: "Error Suggestion (Level AA)",
    conformance: "Supports",
    remarks: "Error messages are specific (e.g., \"URL must point to a *.supabase.co project\", \"Password must be at least 12 characters\", password-strength meter with remaining-char count).",
  },
  {
    id: "3.3.4",
    name: "Error Prevention (Legal, Financial, Data) (Level AA)",
    conformance: "Supports",
    remarks: "Destructive flows (delete row, bulk delete, service-role warning, admin subscription reset, storage bucket delete, agent-session undo, SQL write-mode toggle) all gate behind themed confirmation dialogs as of v3.5.1. Bulk delete and admin reset require typing a confirmation word. Row deletes show a 5-second undo toast. Agent Sentry supports one-click session undo.",
  },
  {
    id: "3.3.7",
    name: "Redundant Entry (Level A) [WCAG 2.2]",
    conformance: "Supports",
    remarks: "Forms don't ask the user to re-enter information they have already supplied in the same session. Sign-up collects credentials once; multi-step flows (connection creation, action / widget editors) preserve in-progress values.",
  },
  {
    id: "3.3.8",
    name: "Accessible Authentication (Minimum) (Level AA) [WCAG 2.2]",
    conformance: "Supports",
    remarks: "Authentication uses email + password (bcrypt) or GitHub OAuth. No cognitive function test (image puzzles, recall, transcription) is required. Password fields support browser autocomplete and password managers. Copy / paste is allowed in every credential field.",
  },
  {
    id: "4.1.2",
    name: "Name, Role, Value (Level A)",
    conformance: "Supports",
    remarks: "Radix primitives handle role / state / value correctly. Custom widgets (password show/hide toggle, advanced-section disclosure, password-strength meter as role=\"meter\") expose state via standard ARIA properties.",
  },
  {
    id: "4.1.3",
    name: "Status Messages (Level AA)",
    conformance: "Partially Supports",
    remarks:
      "Toast notifications use sonner's default polite live region. Form alerts use role=\"alert\". As of v3.5.0 the AI chat conversation is marked role=\"log\" aria-live=\"polite\". Remaining gap: inline loading-state spinners (Refresh schema, EditableField commit, route-level skeletons) don't carry aria-busy or live-region announcement. Will be addressed in a follow-up pass.",
  },
];

const SECTION_508 = [
  {
    chapter: "Chapter 3: Functional Performance Criteria",
    rows: [
      { name: "302.1 Without Vision", conformance: "Partially Supports" as Conformance, remarks: "Operable with screen reader assuming WCAG 2.2 AA partial conformance noted above. Spot-tested with VoiceOver/Safari; not systematically tested with NVDA/JAWS." },
      { name: "302.2 With Limited Vision", conformance: "Partially Supports" as Conformance, remarks: "Zoom + high-contrast colors work. Faint microcopy fails 4.5:1 (see 1.4.3)." },
      { name: "302.3 Without Perception of Color", conformance: "Supports" as Conformance, remarks: "Color is never the sole information carrier (see 1.4.1)." },
      { name: "302.4 Without Hearing", conformance: "Supports" as Conformance, remarks: "No audio." },
      { name: "302.5 With Limited Hearing", conformance: "Supports" as Conformance, remarks: "No audio." },
      { name: "302.6 Without Speech", conformance: "Supports" as Conformance, remarks: "No speech input required." },
      { name: "302.7 With Limited Manipulation", conformance: "Supports" as Conformance, remarks: "Full keyboard alternative for all pointer interactions." },
      { name: "302.8 With Limited Reach and Strength", conformance: "Supports" as Conformance, remarks: "No multi-touch or sustained-press requirements." },
      { name: "302.9 With Limited Language, Cognitive, and Learning Abilities", conformance: "Supports" as Conformance, remarks: "Clear copy, confirmation steps for destructive actions, undo on row deletes." },
    ],
  },
];

const EN_301_549 = [
  {
    chapter: "Chapter 4: Functional Performance Statements (mirrors Section 508 Chapter 3)",
    rows: [
      { name: "4.2 Functional performance", conformance: "Partially Supports" as Conformance, remarks: "See WCAG 2.2 AA section above for criterion-level detail." },
    ],
  },
  {
    chapter: "Chapter 5: Generic Requirements",
    rows: [
      { name: "5.1 Closed functionality", conformance: "Not Applicable" as Conformance, remarks: "Suparbase is a web app, not a closed device." },
      { name: "5.2–5.9 (hardware / biometric / specialized)", conformance: "Not Applicable" as Conformance, remarks: "Software-only product." },
    ],
  },
  {
    chapter: "Chapter 6: ICT with Two-Way Voice Communication",
    rows: [
      { name: "All", conformance: "Not Applicable" as Conformance, remarks: "No two-way voice communication." },
    ],
  },
  {
    chapter: "Chapter 7: ICT with Video Capabilities",
    rows: [
      { name: "All", conformance: "Not Applicable" as Conformance, remarks: "No video content." },
    ],
  },
  {
    chapter: "Chapter 8: Hardware",
    rows: [
      { name: "All", conformance: "Not Applicable" as Conformance, remarks: "Software-only product." },
    ],
  },
  {
    chapter: "Chapter 9: Web (mirrors WCAG 2.1 Level A and AA)",
    rows: [
      { name: "9.1–9.4 (WCAG 2.1 A + AA)", conformance: "Partially Supports" as Conformance, remarks: "See WCAG 2.2 AA section above for criterion-level detail." },
    ],
  },
  {
    chapter: "Chapter 10: Non-Web Documents",
    rows: [
      { name: "All", conformance: "Not Applicable" as Conformance, remarks: "Suparbase ships web pages, not standalone documents." },
    ],
  },
  {
    chapter: "Chapter 11: Software (when applicable)",
    rows: [
      { name: "11.1–11.7", conformance: "Not Applicable" as Conformance, remarks: "Browser-delivered web app; software-platform criteria do not apply." },
      { name: "11.8 Authoring Tools", conformance: "Not Applicable" as Conformance, remarks: "Suparbase is not an authoring tool for accessible content." },
    ],
  },
  {
    chapter: "Chapter 12: Documentation and Support Services",
    rows: [
      { name: "12.1 Product Documentation", conformance: "Supports" as Conformance, remarks: "Documentation is web-based (/docs) and conforms to the same WCAG 2.2 AA posture as the product." },
      { name: "12.2 Support Services", conformance: "Supports" as Conformance, remarks: "Support is via email (contact@suparbase.com, contact@suparbase.com) — accessible through any user agent the customer prefers." },
    ],
  },
];

/**
 * VPAT 2.5 Rev 508 (Web). Format adapted to render cleanly on a web
 * page rather than a Word document; content follows ITI's template
 * exactly — Product Information block, Standards Covered, Terms,
 * then Chapter tables.
 */
export default async function VpatPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="VPAT 2.5 Rev"
          title="Voluntary Product Accessibility Template"
          subtitle={`Suparbase ${PRODUCT_VERSION} · Report date ${REPORT_DATE}. Companion to our plain-English `}
          actions={<Link href="/accessibility" className="text-xs text-accent hover:underline">accessibility statement →</Link>}
        />
        <div className="mt-12 space-y-12">
          <ProductInfo />
          <StandardsCovered />
          <Terms />
          <Chapter title="WCAG 2.2 Level AA report" rows={WCAG_AA} />
          <SectionGroup title="Revised Section 508 Report" groups={SECTION_508} />
          <SectionGroup title="EN 301 549 V3.2.1 (2021-03) Report" groups={EN_301_549} />
          <Footer />
        </div>
      </PageShell>
    </PublicLayout>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ProductInfo() {
  return (
    <Section title="Product information">
      <DataGrid
        rows={[
          ["Vendor Name", "Suparbase"],
          ["Product Name", "Suparbase"],
          ["Product Version", PRODUCT_VERSION],
          ["Report Date", REPORT_DATE],
          ["Product Description", "Authenticated admin workspace for Supabase projects. Encrypted credential vault, server-side PostgREST proxy, RLS debugger, SQL playground, AI-assisted writes, row history, custom actions, dashboard widgets, team workspace, billing, and admin panel."],
          ["Contact for Accessibility", VENDOR_CONTACT],
          ["Notes", "This report reflects code-level review of the production build on the date above. Color contrast was reviewed by inspection of CSS custom properties, not measured with an automated tool. Customers requiring measured WCAG ratios should run axe-core or Lighthouse against their deployed instance."],
        ]}
      />
    </Section>
  );
}

function StandardsCovered() {
  return (
    <Section title="Applicable standards and guidelines">
      <Prose>
        <ul>
          <li>
            <strong>Web Content Accessibility Guidelines 2.2</strong> (WCAG 2.2) at
            conformance level AA, per the{" "}
            <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer">
              W3C Recommendation
            </a>
            . The product targets Level AA across the entire surface.
          </li>
          <li>
            <strong>Revised Section 508 Standards</strong> (36 CFR Part 1194, App. A,
            B, and C — published Jan 18, 2017), the U.S. federal procurement standard.
          </li>
          <li>
            <strong>EN 301 549 V3.2.1 (2021-03)</strong>, the European procurement
            standard for ICT accessibility.
          </li>
        </ul>
      </Prose>
    </Section>
  );
}

function Terms() {
  return (
    <Section title="Terms">
      <Prose>
        <ul>
          <li>
            <strong>Supports</strong>: The functionality of the product has at least
            one method that meets the criterion without known defects or meets with
            equivalent facilitation.
          </li>
          <li>
            <strong>Partially Supports</strong>: Some functionality of the product
            does not meet the criterion.
          </li>
          <li>
            <strong>Does Not Support</strong>: The majority of product functionality
            does not meet the criterion.
          </li>
          <li>
            <strong>Not Applicable</strong>: The criterion is not relevant to the
            product.
          </li>
          <li>
            <strong>Not Evaluated</strong>: The product has not been evaluated against
            the criterion. (Used only for WCAG 2.2 Level AAA in this report, which is
            outside VPAT 2.5 AA scope.)
          </li>
        </ul>
      </Prose>
    </Section>
  );
}

function Chapter({ title, rows }: { title: string; rows: Criterion[] }) {
  return (
    <Section title={title}>
      <div className="overflow-x-auto rounded-lg border hairline">
        <table className="w-full text-xs">
          <thead className="bg-bg-raised/60 text-left">
            <tr className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
              <th scope="col" className="px-4 py-3 font-medium" style={{ width: "8%" }}>
                #
              </th>
              <th scope="col" className="px-4 py-3 font-medium" style={{ width: "32%" }}>
                Criterion
              </th>
              <th scope="col" className="px-4 py-3 font-medium" style={{ width: "20%" }}>
                Conformance
              </th>
              <th scope="col" className="px-4 py-3 font-medium" style={{ width: "40%" }}>
                Remarks &amp; Explanations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y hairline">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 font-mono text-fg-faint">{r.id}</td>
                <td className="px-4 py-3 text-fg">{r.name}</td>
                <td className="px-4 py-3">
                  <ConformancePill value={r.conformance} />
                </td>
                <td className="px-4 py-3 text-fg-muted">{r.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function SectionGroup({
  title,
  groups,
}: {
  title: string;
  groups: { chapter: string; rows: Array<{ name: string; conformance: Conformance; remarks: string }> }[];
}) {
  return (
    <Section title={title}>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.chapter}>
            <h3 className="mb-2 font-display text-base">{g.chapter}</h3>
            <div className="overflow-x-auto rounded-lg border hairline">
              <table className="w-full text-xs">
                <thead className="bg-bg-raised/60 text-left">
                  <tr className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                    <th scope="col" className="px-4 py-3 font-medium" style={{ width: "32%" }}>Criterion</th>
                    <th scope="col" className="px-4 py-3 font-medium" style={{ width: "20%" }}>Conformance</th>
                    <th scope="col" className="px-4 py-3 font-medium" style={{ width: "48%" }}>Remarks &amp; Explanations</th>
                  </tr>
                </thead>
                <tbody className="divide-y hairline">
                  {g.rows.map((r) => (
                    <tr key={r.name} className="align-top">
                      <td className="px-4 py-3 text-fg">{r.name}</td>
                      <td className="px-4 py-3">
                        <ConformancePill value={r.conformance} />
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{r.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <Section title="Legal disclaimer and revision history">
      <Prose>
        <p>
          This VPAT was prepared by Suparbase&apos;s engineering team via code-level
          audit of the production build at the report date, supplemented by
          spot-testing with VoiceOver on macOS and keyboard-only navigation.
          Automated accessibility scanning (axe-core, Lighthouse) and systematic
          screen-reader testing across NVDA and JAWS have not yet been performed.
        </p>
        <p>
          Suparbase does not warrant this VPAT for legal or procurement purposes
          beyond a good-faith disclosure of the product&apos;s current state.
          Customers requiring formal third-party audit reports should request
          one — we will commission one against the production build on request.
        </p>
        <p>
          Revisions:
        </p>
        <ul>
          <li>
            <strong>{REPORT_DATE}</strong> — updated to WCAG 2.2 Level AA (was
            2.1). Added rows for the six new 2.2 success criteria: 2.4.11
            Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8
            Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant
            Entry, 3.3.8 Accessible Authentication (Minimum). 4.1.1 Parsing
            removed (obsolete in 2.2). Accompanies the v3.5.1 UI bug pass:
            replaced 12 native window.confirm() calls with themed
            ConfirmDialog (including the destructive admin Reset, storage
            bucket delete, agent-session undo, SQL write-mode toggle); added
            an explicit focus-visible ring to the Button component; wired
            PaywallCard into the team-invite flow; humanised billing status
            copy; fixed NULL display rendering as colon character across the
            data grid.
          </li>
          <li>
            <strong>2026-05-15</strong> — initial VPAT 2.5 Rev publication
            against WCAG 2.1 Level AA accompanying the v3.5.0 accessibility
            pass (skip link, bare-label form fields, Radix Tooltip
            replacements, AI chat live region, system-theme toasts).
          </li>
        </ul>
        <p>
          Questions or accessibility issue reports:{" "}
          <a href={`mailto:${VENDOR_CONTACT}`}>{VENDOR_CONTACT}</a>.
        </p>
      </Prose>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Reusable
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 font-display text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function DataGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="overflow-x-auto rounded-lg border hairline">
      <table className="w-full text-xs">
        <tbody className="divide-y hairline">
          {rows.map(([k, v]) => (
            <tr key={k} className="align-top">
              <th
                scope="row"
                className="w-[28%] bg-bg-raised/40 px-4 py-3 text-left text-[10px] uppercase tracking-[0.16em] text-fg-faint"
              >
                {k}
              </th>
              <td className="px-4 py-3 text-fg-muted">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConformancePill({ value }: { value: Conformance }) {
  const tone =
    value === "Supports"
      ? "bg-accent/15 text-accent"
      : value === "Partially Supports"
      ? "bg-amber-500/15 text-amber-400"
      : value === "Does Not Support"
      ? "bg-danger/15 text-danger"
      : "bg-bg-raised text-fg-faint";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
        tone
      }
    >
      {value}
    </span>
  );
}
