# Implementation Plan: Suparbase: Authenticated SaaS

**Branch**: `002-suparbase-saas` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)

## Summary

Migrate the v0.1 client-only SPA to a Next.js 15 (App Router) SaaS with
GitHub OAuth via NextAuth v5, a Drizzle-backed Postgres database, an
encrypted credential vault, and a server-side proxy for all PostgREST
interaction. The v0.1 admin functionality is preserved verbatim; the
delta is auth, persistence, and the server boundary that keeps user
API keys off the browser.

## Technical Context

**Language/Version**: TypeScript 5.7+, Node 20 LTS

**Primary Dependencies**:
- Framework: `next@15`, `react@19`, `react-dom@19`
- Auth: `next-auth@beta` (v5), `@auth/drizzle-adapter`
- DB: `drizzle-orm`, `drizzle-kit`, `postgres` (postgres-js driver)
- UI: Tailwind CSS 3.4, Radix UI primitives, `lucide-react`, `clsx`,
  `tailwind-merge`, `class-variance-authority`, `cmdk`
- Data: `@tanstack/react-query` v5, `@tanstack/react-table` v8
- Forms: `react-hook-form` v7, `zod` v3
- Motion (landing): `gsap` v3, `@gsap/react`
- Toasts: `sonner`
- Fonts: `@fontsource-variable/{inter,jetbrains-mono,fraunces}`

**Storage**:
- App DB: Postgres (provider-agnostic; tested against Supabase + Neon).
- Schema:
  - `users`, `accounts`, `sessions`, `verification_tokens` (NextAuth)
  - `connections`: owned by user, encrypted key
  - `audit_log`: write history
- No in-app state lib; React Query + URL state cover everything.

**Testing**: `tsc --noEmit` + `next build` + manual smoke checklist.
No unit-test framework added (same rationale as v0.1).

**Target Platform**: Modern evergreen browsers; Node 20 server runtime;
Vercel or any Node host. **Edge runtime is not used**: the encryption
module relies on Node `crypto`.

**Project Type**: Next.js App Router web application.

**Performance Goals**: Landing Lighthouse ≥90/95/95; workspace TTI ≤2.5s
warm.

**Constraints**:
- Initial JS payload (landing/signin): ≤ 220KB gz
- Total JS at first paint of any workspace route: ≤ 520KB gz
- Initial CSS: ≤ 80KB gz
- No edge runtime (Node only) · needed for `crypto.createCipheriv`

**Scale/Scope**: Single Postgres instance, single deploy, ≤ 50 tables
× 100 columns per user connection, 6–10 active connections per user.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Streaming proxy for list payloads; workspace lazy-routed; React Query staleTime tuned. |
| II. Motion Serves Comprehension | PASS | GSAP scoped to `/` landing; CSS transitions everywhere else. |
| III. Anti-AI-Slop Design | PASS | Phosphor-green accent, Fraunces display, Inter body: distinct from shadcn template. |
| IV. Accessibility (NON-NEG) | PASS | Radix primitives; keyboard-first interaction; reduced-motion honored. |
| V. Server-Side Vault & Proxy (NON-NEG) | PASS | Encryption module + proxy route are the spine of the design. |
| VI. Clean Code Discipline | PASS | `src/server/` clean of client imports; `src/client/` clean of server imports; vault, audit, proxy in dedicated modules. |
| VII. Data & Security (NON-NEG) | PASS | AES-256-GCM with versioned ciphertext; ownership check at every proxy entry; redaction in every error path; rate limit on write verbs. |
| VIII. Account & Tenancy | PASS | Connections owned by user_id with FK constraints; audit log keyed by user + connection. |

**Result**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/002-suparbase-saas/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth.md
│   ├── connection-api.md
│   ├── proxy.md
│   └── audit.md
└── tasks.md
```

### Source layout (repository root, post-migration)

```text
.
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── .env.example
├── public/favicon.svg
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root layout (fonts, html lang, theme)
│   │   ├── globals.css
│   │   ├── page.tsx                   # marketing landing
│   │   ├── signin/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── connections/route.ts          # GET list, POST create
│   │   │   ├── connections/[id]/route.ts     # GET, PATCH, DELETE
│   │   │   └── v/[id]/
│   │   │       ├── introspect/route.ts
│   │   │       └── rest/[...path]/route.ts   # proxy
│   │   ├── (auth)/                    # routes requiring sign-in
│   │   │   ├── layout.tsx             # server check + redirect
│   │   │   ├── connections/page.tsx
│   │   │   ├── connections/new/page.tsx
│   │   │   └── c/[id]/                # workspace
│   │   │       ├── layout.tsx         # connection guard + topbar
│   │   │       ├── page.tsx           # dashboard
│   │   │       ├── tables/page.tsx
│   │   │       ├── tables/[name]/page.tsx
│   │   │       ├── tables/[name]/new/page.tsx
│   │   │       ├── tables/[name]/[pk]/page.tsx
│   │   │       ├── schema/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── error.tsx                  # top-level error boundary
│   ├── server/                        # SERVER-ONLY modules
│   │   ├── auth.ts                    # NextAuth config
│   │   ├── db.ts                      # Drizzle client
│   │   ├── schema/
│   │   │   ├── auth.ts                # users/accounts/sessions
│   │   │   ├── connections.ts
│   │   │   └── audit.ts
│   │   ├── crypto/
│   │   │   └── vault.ts               # encryptKey / decryptKey
│   │   ├── connections/
│   │   │   ├── repo.ts                # CRUD operations
│   │   │   └── jwt.ts                 # decodeJwtRole (server copy)
│   │   ├── proxy/
│   │   │   ├── forward.ts             # the actual fetch proxy
│   │   │   └── ratelimit.ts           # per-user write limit
│   │   ├── audit/
│   │   │   └── log.ts                 # auditWrite()
│   │   └── schema-introspect/
│   │       └── index.ts               # server-side introspection
│   ├── lib/                           # SHARED, isomorphic
│   │   ├── types/
│   │   │   ├── schema.ts              # Schema / Table / Column
│   │   │   └── connection.ts          # ConnectionSummary
│   │   ├── pgrest/
│   │   │   ├── client.ts              # pgrest() fetch wrapper used by client
│   │   │   ├── rows.ts                # list/get/insert/update/delete
│   │   │   ├── count.ts
│   │   │   └── reference.ts
│   │   ├── errors.ts                  # AppError + toAppError + redact
│   │   ├── table/                     # cellFormat, pk encode/decode
│   │   ├── forms/                     # zod schema builder, field defaults
│   │   └── ui/cn.ts
│   ├── components/                    # CLIENT components ("use client")
│   │   ├── ui/                        # button, input, dialog, switch, etc.
│   │   ├── workspace/                 # Sidebar, Topbar, ErrorBoundary, RouteLoader
│   │   ├── connections/               # ConnectionList, ConnectionForm, ServiceRoleWarning
│   │   ├── data/                      # DataGrid, FkBadge, PaginationBar, TableTile, DataGridToolbar
│   │   ├── row/                       # RowForm, RowDrawer, DeleteRowDialog
│   │   ├── landing/                   # MarketingHero (GSAP)
│   │   └── auth/                      # SignInForm, UserMenu
│   └── hooks/
│       ├── useDocumentTitle.ts
│       ├── useDebouncedValue.ts
│       └── useReducedMotion.ts
└── drizzle/
    └── 0000_initial.sql               # initial migration
```

**Structure Decision**: Hard `src/server/` vs `src/lib/` vs
`src/components/` boundary. `src/server/` modules MUST NOT be imported
by client components (enforced by `server-only` package). `src/lib/` is
isomorphic data shapes + pure functions. `src/components/` is all
`"use client"`.

## Complexity Tracking

| Decision | Why | Simpler Alternative Rejected Because |
|----------|-----|--------------------------------------|
| Server-side proxy for every PostgREST call | Constitution Principle V: keys off the browser. | Decrypting the key into the browser is the v0.1 model; we just promoted to "production ready": that requires never shipping the key to client code. |
| Drizzle over Prisma | Smaller bundle, faster cold starts on serverless, type-safe SQL. | Prisma's Rust query engine bloats the deploy bundle and slows down Vercel cold starts. |
| NextAuth v5 (Auth.js) | First-party Next.js integration; Drizzle adapter is official. | Building our own session management is busy-work for an admin tool. |
| No edge runtime | `crypto.createCipheriv` is unavailable in edge; we keep the code path simple by serving from Node. | Edge would mean Web Crypto via `crypto.subtle`, doable but adds branching. |
| AES-256-GCM with versioned ciphertext | Standard authenticated encryption; version byte lets us rotate keys without downtime. | Plaintext-in-DB (insane). KMS (heavy ops dependency for v1). |
| Audit log retention indefinite in v1 | Operators may want to prune later; deferring the policy is cheap. | Auto-prune in v1 is a policy decision better left to deploy time. |
