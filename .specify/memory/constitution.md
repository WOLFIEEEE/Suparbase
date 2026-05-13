<!--
SYNC IMPACT REPORT
==================
Version change: 2.0.0 → 3.0.0
Reason for MAJOR bump: product is now a multi-tenant SaaS with a real
backend, server-side credential vault, and authenticated user accounts.
Principle V ("Client-Only SPA, Bring-Your-Own-Backend") is removed and
replaced with Principle V (Server-Side Vault & Proxy) and a new
Principle VIII (Account & Tenancy).

Modified principles:
  - I. Performance First → kept; budgets restated for Next.js bundles
  - II. Motion Serves Comprehension → kept verbatim
  - III. Anti-AI-Slop Design → kept verbatim
  - IV. Accessibility → kept verbatim
  - V. Client-Only SPA, Bring-Your-Own-Backend → REPLACED with
    "Server-Side Vault & Proxy" (MAJOR)
  - VI. Clean Code Discipline → kept; expanded with server/client boundary
  - VII. Data & Security → kept; strengthened (encryption-at-rest now
    mandatory; key never reaches the browser)

Added sections:
  - Principle VIII (Account & Tenancy)
  - Data & Security: AES-256-GCM, key rotation expectations
  - Technology & Performance Standards: Next.js, Drizzle, NextAuth

Removed sections:
  - The "static dist/" deployment promise (Principle V old text)

Templates requiring updates:
  - ✅ plan-template.md compatible
  - ✅ spec-template.md compatible
  - ✅ tasks-template.md compatible
Deferred items: None
-->

# Suparbase Constitution

## Core Principles

### I. Performance First (NON-NEGOTIABLE)
The application MUST sustain 60fps for scroll, table virtualization, and
modal transitions on a 2020-era laptop and a recent mid-range phone.
Lighthouse Performance ≥90, Accessibility ≥95, Best Practices ≥95 on the
production build of the unauthenticated landing surface. Authenticated
workspace MUST reach Time-To-Interactive ≤2.5s on a warm cache. Lists of
1000+ rows MUST be virtualized. Fonts use `font-display: swap`. The
server MUST stream the proxy response (not buffer entire bodies) for
list queries. Rationale: an admin tool that lags is worse than no tool.

### II. Motion Serves Comprehension
Animation is permitted in two roles only: (a) signaling state change
(row insert, drawer open, tab switch) so the user can track what moved,
and (b) brand moments on the landing/auth surface. Decorative motion in
dense data surfaces is forbidden. Every transition has a defined
duration, easing, and a reduced-motion fallback. GSAP is reserved for
the landing surface; in-app micro-interactions use CSS transitions or
Radix primitives' built-ins. Rationale: data wins over decoration.

### III. Anti-AI-Slop Design
The visual language MUST be distinctive: deliberate typography (no
generic system stacks on brand surfaces), a small intentional color
system with one bold accent, and layouts that do not read as "another
shadcn dashboard template." Reject default purple-to-blue gradients,
three-card hero grids, and identical-looking sidebars. Rationale: an
admin product indistinguishable from competitors is forgotten.

### IV. Accessibility (NON-NEGOTIABLE)
`prefers-reduced-motion` MUST be honored across every animation. All
interactive elements (inputs, buttons, tabs, dialog triggers, menu
items, row actions) MUST be keyboard reachable with visible focus
states. Form fields MUST have associated labels and accessible error
messaging. Data tables MUST be navigable by keyboard. Color contrast
MUST meet WCAG AA. Use semantic HTML and Radix primitives; ARIA only
where semantics are insufficient. Rationale: admin tools are used for
hours — accessibility correctness is a productivity feature.

### V. Server-Side Vault & Proxy (NON-NEGOTIABLE)
User-supplied Supabase credentials (project URL + API key) MUST be
stored encrypted at rest in the application database. The decrypted key
MUST NEVER be sent to the browser; the server MUST proxy all PostgREST
calls on behalf of the authenticated owner, injecting the key into
outbound requests. The browser receives only a session cookie. Every
authenticated request MUST verify that the requested connection belongs
to the current user before decrypting or forwarding. Encryption uses
AES-256-GCM with a key sourced from `SUPARBASE_ENCRYPTION_KEY`. Rotating
the encryption key MUST be possible without data loss (versioned
ciphertext). Rationale: the previous "key in localStorage" model is a
known foot-gun; an authenticated SaaS that punts secret-handling to the
client cannot claim to be production-ready.

### VI. Clean Code Discipline
No dead code, no unused exports, no commented-out blocks, no
`TODO`/`FIXME` in shipped output. Server-only modules MUST live under
`src/server/` and MUST NOT be imported from client components;
client-only modules MUST be marked `"use client"` and MUST NOT import
server-only modules. Schema-introspection logic, data-access logic,
encryption, and the credential vault MUST live in dedicated modules,
never in route handlers. Form generation, table generation, and field
rendering MUST be data-driven from the introspected schema. No
abstraction without a second concrete caller. Rationale: server/client
boundary errors are the leading source of incidents in Next.js apps;
treat the line as a hard contract.

### VII. Data & Security (NON-NEGOTIABLE)
The user's API key is sensitive. The app MUST:
- Encrypt keys at rest with AES-256-GCM; never log keys in plaintext.
- Defensively redact JWT-shaped substrings from any error message before
  any logging, in any process.
- Warn prominently when a service-role key is detected; the warning
  state persists in Settings while that connection is active.
- Require an authenticated session for every API route that touches a
  connection; verify ownership at the row level.
- Confirm destructive actions proportionally (delete > update > insert);
  destructive operations on a row MUST be reversible via undo where
  feasible, or gated by typed confirmation otherwise.
- Rate-limit all proxy endpoints per-user.
- Set HTTP security headers: HSTS, CSP, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy.
Rationale: this product holds the keys to our users' production data.

### VIII. Account & Tenancy
Each user owns the connections they create; no implicit sharing in v1.
A user MUST be able to see, rename, and delete every connection they
own. Deletion MUST cryptographically erase the encrypted credentials
(overwrite + delete row). Every write performed via the proxy MUST be
recorded in an audit log keyed by user, connection, table, primary key,
verb, and timestamp. Rationale: SaaS without traceability is not
operable for teams or for incident response.

## Technology & Performance Standards

**Required stack**:
- Framework: Next.js 15+ (App Router) with TypeScript 5+
- UI: React 19 (Server Components where applicable), Tailwind CSS 3+,
  Radix UI primitives, Lucide icons, `clsx`, `tailwind-merge`,
  `class-variance-authority`
- Data: `@tanstack/react-query` v5 for client-side query state,
  `@tanstack/react-table` v8 for tables
- Auth: `next-auth` v5 (Auth.js) with `@auth/drizzle-adapter`
- DB: PostgreSQL (any provider) with `drizzle-orm` and `drizzle-kit`
- Forms: `react-hook-form` v7 + `zod` v3
- Motion (landing only): `gsap` v3 + `@gsap/react`
- Utilities: `date-fns`, `sonner` (toasts), `nanoid`

**Permitted additions** (no justification needed): `cmdk`,
`@radix-ui/*`, `bcryptjs` (if any future password mode), `pg`/`postgres`.

**Forbidden without justification**: alternative ORMs (Prisma, etc.),
alternative auth libraries, additional state management, alternative
animation libraries, server-rendered animation engines, headless CMSes.

**Build budgets**:
- Initial JS payload (landing / signin): ≤ 220KB gzipped
- Total JS payload at first paint of any authenticated route:
  ≤ 520KB gzipped (allowance for React 19 + Radix + tanstack)
- Initial CSS payload: ≤ 80KB gzipped
- LCP (landing) ≤ 1.8s on simulated 4G; CLS ≤ 0.05

**Browser support**: latest two stable versions of Chrome, Safari,
Firefox, Edge.

## Development Workflow & Quality Gates

**Pre-merge gates** (every change MUST pass):
1. `tsc --noEmit` passes with no errors.
2. `next build` succeeds and bundle remains within budgets.
3. `drizzle-kit check` reports no schema drift.
4. Manual smoke check: sign-in, create connection, browse a table,
   create/edit/delete a row, sign-out.
5. No `console.log` / `console.error` / `console.warn` calls remain in
   shipped code paths (audit script).
6. Constitution Check (in plan.md) re-verified if scope changed.

**Spec-Kit workflow is authoritative**: features begin with
`/speckit-specify`, proceed through `/speckit-plan`, `/speckit-tasks`,
and conclude with `/speckit-implement`.

**Code review focus**: reviewers MUST verify schema-introspection
correctness on at least three real schemas, performance budgets
(Principle I), accessibility coverage (Principle IV), the
server/client boundary (Principle VI), and credential handling
(Principles V, VII) before approving.

## Governance

This constitution supersedes ad-hoc preferences. Amendments require:
(a) a written proposal in the commit message or PR description naming
the affected principle, (b) a version bump per the rules below, and
(c) propagation to dependent templates and any agent guidance files.

**Versioning policy**:
- **MAJOR**: removing or fundamentally redefining a principle, or
  relaxing a NON-NEGOTIABLE.
- **MINOR**: adding a new principle or materially expanding an existing
  one.
- **PATCH**: clarifications, wording, typo fixes.

**Compliance review**: every plan.md MUST address Principles I, IV, V,
VI, VII in a Constitution Check section. Violations MUST be documented
with explicit justification.

**Runtime guidance**: agent-specific files MAY exist for tooling
preferences but MUST NOT contradict this constitution.

**Version**: 3.0.0 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-05-13
