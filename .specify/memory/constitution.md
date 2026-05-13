<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0
Reason for MAJOR bump: product redefined from a static marketing site to a
real interactive admin application; Principle V ("Static, Self-Contained
Deployment") and the locked stack list were fundamentally redefined.

Modified principles:
  - V. Static, Self-Contained Deployment → V. Client-Only SPA, Bring-Your-Own-Backend
  - II. Motion With Meaning → II. Motion Serves Comprehension (narrowed scope)
  - I. Performance First (NON-NEGOTIABLE) → kept; perf budgets adjusted to app realities
  - III. Anti-AI-Slop Design → kept verbatim
  - IV. Accessibility (NON-NEGOTIABLE) → kept; strengthened for forms & tables
  - VI. Clean Code Discipline → kept

Added sections: Data & Security Principle (VII)
Removed sections: None
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check remains generic — compatible)
  - ✅ .specify/templates/spec-template.md (compatible)
  - ✅ .specify/templates/tasks-template.md (compatible)
Deferred items: None
-->

# Suparbase Constitution

## Core Principles

### I. Performance First (NON-NEGOTIABLE)
The application MUST sustain 60fps for scroll, table virtualization, and
modal/drawer transitions on a 2020-era laptop and a recent mid-range phone.
Lighthouse Performance ≥90, Accessibility ≥95, Best Practices ≥95, SEO ≥90 on
the production build of the unauthenticated landing/connect screen. The
authenticated workspace MUST achieve Time-To-Interactive ≤2.5s on a warm cache.
Lists of 1000+ rows MUST be virtualized. Fonts MUST use `font-display: swap`.
Rationale: an admin tool that lags is worse than no tool.

### II. Motion Serves Comprehension
Animation is permitted in two roles only: (a) signaling state change — a row
inserts, a drawer opens, a tab switches — so the user can track what moved, and
(b) brand moments on the connect/landing screen. Decorative motion in dense data
surfaces is forbidden. Every transition MUST have a defined duration, easing,
and a reduced-motion fallback. GSAP is reserved for the landing/connect screen
and page transitions; in-app micro-interactions use CSS transitions or Radix
primitives' built-ins. Rationale: motion competes for attention with data;
data wins.

### III. Anti-AI-Slop Design
The visual language MUST be distinctive: deliberate typography (no generic
system stacks for the brand surfaces), a small intentional color system with one
bold accent, and layouts that do not read as "another shadcn dashboard
template." Reject default purple-to-blue gradients, three-card hero grids, and
identical-looking sidebars. Tables, forms, and dialogs MUST feel like they
belong to *this* product, not to a starter kit. Rationale: an admin product
that looks identical to its competitors is forgotten.

### IV. Accessibility (NON-NEGOTIABLE)
`prefers-reduced-motion` MUST be honored across every animation. All
interactive elements (inputs, buttons, tabs, dialog triggers, menu items, row
actions) MUST be keyboard reachable with visible focus states. Form fields MUST
have associated labels and accessible error messaging. Data tables MUST be
navigable by keyboard. Color contrast MUST meet WCAG AA. Use semantic HTML and
Radix primitives; ARIA is added only where semantics are insufficient.
Rationale: admin tools are used for hours — accessibility correctness is a
productivity feature, not a checkbox.

### V. Client-Only SPA, Bring-Your-Own-Backend
The application is a single-page client application that connects directly to a
user-supplied Supabase project (URL + API key). The app itself ships NO server
runtime, NO first-party database, NO backend API. All persistence is the
visitor's own Supabase project. Connection credentials live in the browser
(localStorage / sessionStorage) — the app never proxies them to a third party.
The output is a static `dist/` bundle deployable to any static host. Rationale:
zero-trust posture for the operator; zero infrastructure for the user.

### VI. Clean Code Discipline
No dead code, no unused exports, no commented-out blocks, no `TODO`/`FIXME` in
shipped output. Components MUST be single-responsibility. Schema-introspection
logic and data-access logic MUST live in dedicated modules — never inside view
components. Form generation, table generation, and field rendering MUST be
data-driven from the introspected schema, not duplicated per table. No
abstraction without a second concrete caller; no premature generalization.
Rationale: this codebase will grow as schemas grow — keep the surface honest.

### VII. Data & Security
The user's API key (anon or service role) is sensitive. The app MUST: warn
prominently when the service-role key is detected; never log keys to the
console; never include keys in error reports; default to clearing keys on
"Disconnect"; require an explicit "remember on this device" opt-in before
persisting beyond the session. All writes MUST show a confirmation step
proportional to risk (delete > update > insert). Destructive actions MUST be
reversible-via-undo where feasible, or gated by typed confirmation when not.
Rationale: this product holds the keys to the user's production data — treat
that responsibility seriously.

## Technology & Performance Standards

**Required stack**:
- Build: Vite 5+, TypeScript 5+
- UI: React 18+, Tailwind CSS 3+, shadcn/ui (Radix primitives + Tailwind), Lucide icons
- Data: `@supabase/supabase-js` v2, `@tanstack/react-query` v5, `@tanstack/react-table` v8
- Routing: `react-router-dom` v6
- Forms: `react-hook-form` v7, `zod` v3
- Motion (landing/connect only): `gsap` 3 with `@gsap/react`

**Permitted additions** (do not require justification): `clsx`, `tailwind-merge`,
`class-variance-authority`, `date-fns`, `nanoid`, `react-hot-toast` (or sonner).

**Forbidden without justification**: additional state libraries (Zustand,
Redux, Jotai — React Query + URL state is the rule), additional animation
libraries (Framer Motion, Anime.js), UI kits other than shadcn-style Radix
wrappers, full-page CSS-in-JS runtimes, headless CMS, server components,
SSR/SSG frameworks.

**Build budgets**:
- Initial JS payload (landing route): ≤ 220KB gzipped
- Total JS payload (authenticated workspace, lazy-loaded routes included):
  ≤ 480KB gzipped at first paint of any route
- Initial CSS payload: ≤ 80KB gzipped
- Largest Contentful Paint (landing): ≤ 1.8s on simulated 4G
- Cumulative Layout Shift: ≤ 0.05

**Browser support**: latest two stable versions of Chrome, Safari, Firefox, Edge.

## Development Workflow & Quality Gates

**Pre-merge gates** (every change MUST pass):
1. `tsc --noEmit` passes with no errors.
2. `vite build` succeeds and bundle remains within budgets.
3. Manual smoke check: connect screen accepts URL+key, dashboard renders the
   introspected schema, at least one table opens, create/edit/delete a row
   round-trips, disconnect clears credentials.
4. Reduced-motion preference is respected on the landing/connect surface.
5. Constitution Check (in plan.md) is re-verified if scope changed.

**Spec-Kit workflow is authoritative**: features begin with `/speckit-specify`,
proceed through `/speckit-plan`, `/speckit-tasks`, and conclude with
`/speckit-implement`. Skipping stages is forbidden for any change that adds
sections, animations, or dependencies.

**Code review focus**: reviewers MUST verify schema-introspection correctness
on at least three real schemas, performance budgets (Principle I), accessibility
coverage (Principle IV), and credential handling (Principle VII) before
approving.

## Governance

This constitution supersedes ad-hoc preferences and prior conventions. Amendments
require: (a) a written proposal in the commit message or PR description naming
the affected principle, (b) version bump per semantic versioning rules below,
and (c) propagation to any dependent template if the amendment changes mandatory
sections.

**Versioning policy**:
- **MAJOR**: removing or fundamentally redefining a principle, or relaxing a
  NON-NEGOTIABLE.
- **MINOR**: adding a new principle or materially expanding an existing one.
- **PATCH**: clarifications, wording, typo fixes.

**Compliance review**: every plan.md MUST include a Constitution Check section
that explicitly addresses Principles I (perf), IV (accessibility), V (client-
only / BYOB), and VII (data & security). Violations MUST be documented in
Complexity Tracking with explicit justification.

**Runtime guidance**: agent-specific files (e.g., `CLAUDE.md`) MAY exist for
tooling preferences but MUST NOT contradict this constitution.

**Version**: 2.0.0 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-05-13
