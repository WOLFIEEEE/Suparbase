# Tasks: Suparbase: Authenticated SaaS

Numbered in execution order. `[P]` = parallelizable (different files,
no in-flight deps).

## Phase 1: Migration setup

- [ ] T001 Archive Vite scaffold (delete: `vite.config.ts`, `index.html`, `tsconfig.app.json`, `tsconfig.node.json`, `src/main.tsx`, `src/App.tsx`, `src/components/connect/*`, `src/routes/*`, `src/lib/connection/store.ts`, `healthcheck.ts`, `validate.ts`, `src/lib/supabase/client.ts`, `src/lib/api/hooks.ts`, `src/lib/api/rows.ts`, `src/lib/api/count.ts`, `src/lib/api/reference.ts`)
- [ ] T002 Rewrite `package.json` for Next.js: deps include `next@15`, `react@19`, `next-auth@beta`, `@auth/drizzle-adapter`, `drizzle-orm`, `drizzle-kit`, `postgres`, `server-only`, drop `vite`, `@vitejs/plugin-react`, `react-router-dom`, `@supabase/supabase-js`
- [ ] T003 Replace `tsconfig.json` with Next.js's preset (`"@types/react": ^19`, `"jsx": "preserve"`, paths alias)
- [ ] T004 Add `next.config.ts` with security headers, image domains (`avatars.githubusercontent.com`)
- [ ] T005 Add `drizzle.config.ts` pointing at `src/server/schema/index.ts`
- [ ] T006 Write `.env.example` with all required env vars
- [ ] T007 Update `.gitignore` for `.next/`, `.env.local`

## Phase 2: Server foundation

- [ ] T010 Write `src/server/db.ts`: `postgres` connection + Drizzle client
- [ ] T011 Write `src/server/schema/auth.ts`: NextAuth tables
- [ ] T012 Write `src/server/schema/connections.ts`
- [ ] T013 Write `src/server/schema/audit.ts`
- [ ] T014 Write `src/server/schema/index.ts`: re-exports
- [ ] T015 Generate initial migration `drizzle/0000_initial.sql` via `drizzle-kit generate`
- [ ] T016 Write `src/server/crypto/vault.ts`: `encryptKey`, `decryptKey` with AES-256-GCM + version byte
- [ ] T017 Write `src/server/auth.ts`: NextAuth v5 config with Drizzle adapter + GitHub provider
- [ ] T018 Write `src/server/connections/jwt.ts`: server copy of role decoder (same logic, separate file to keep boundary clean)
- [ ] T019 Write `src/server/connections/repo.ts`: list / get / create / rename / delete with encryption
- [ ] T020 Write `src/server/audit/log.ts`: `auditWrite()` insert helper
- [ ] T021 Write `src/server/proxy/ratelimit.ts`: in-memory token bucket per user
- [ ] T022 Write `src/server/proxy/forward.ts`: the actual forwarding logic
- [ ] T023 Write `src/server/schema-introspect/index.ts`: server-side OpenAPI fetch + parse (port from v0.1 `introspect.ts`)

## Phase 3: App skeleton

- [ ] T030 Write `src/app/layout.tsx`: html, body, fonts, providers wrapper
- [ ] T031 Write `src/app/globals.css` (port v0.1 `index.css` minus Vite font imports → use `@fontsource-variable` via Next.js)
- [ ] T032 Write `src/app/providers.tsx` (client): QueryClientProvider, Toaster, TooltipProvider
- [ ] T033 Write `src/app/page.tsx`: marketing landing (client component using GSAP)
- [ ] T034 Write `src/app/signin/page.tsx`: sign-in screen
- [ ] T035 Write `src/app/api/auth/[...nextauth]/route.ts`: re-export NextAuth handlers
- [ ] T036 Write `src/app/api/health/route.ts`: DB ping
- [ ] T037 Write `src/app/(auth)/layout.tsx`: server-side session check, redirect on null
- [ ] T038 Write `src/app/error.tsx`: top-level error boundary

## Phase 4: Connection management

- [ ] T040 Write `src/app/api/connections/route.ts`: GET list, POST create (full validation + introspection ping)
- [ ] T041 Write `src/app/api/connections/[id]/route.ts`: GET, PATCH, DELETE
- [ ] T042 Write `src/app/(auth)/connections/page.tsx`: list of saved connections (server component fetching directly)
- [ ] T043 Write `src/app/(auth)/connections/new/page.tsx`: new-connection form
- [ ] T044 Write `src/components/connections/ConnectionForm.tsx`: client form with URL + name + key, role detection, service-role warning
- [ ] T045 Write `src/components/connections/ConnectionList.tsx`: client list with delete + rename actions
- [ ] T046 Write `src/components/connections/ServiceRoleWarning.tsx`: dialog (port from v0.1)
- [ ] T047 Wire delete and rename via React Query mutations

## Phase 5: Proxy + introspection

- [ ] T050 Write `src/app/api/v/[id]/rest/[...path]/route.ts`: proxy handler (GET/POST/PATCH/PUT/DELETE/HEAD)
- [ ] T051 Write `src/app/api/v/[id]/introspect/route.ts`: introspection endpoint
- [ ] T052 Write `src/lib/pgrest/client.ts`: `pgrest()` fetch wrapper
- [ ] T053 Write `src/lib/pgrest/rows.ts`: list/get/insert/update/delete using pgrest()
- [ ] T054 Write `src/lib/pgrest/count.ts`
- [ ] T055 Write `src/lib/pgrest/reference.ts`
- [ ] T056 Write `src/lib/api/hooks.ts`: React Query hooks consuming pgrest helpers

## Phase 6: Workspace UI port

- [ ] T060 Write `src/app/(auth)/c/[id]/layout.tsx`: connection guard + sidebar + topbar
- [ ] T061 Write `src/app/(auth)/c/[id]/page.tsx`: dashboard (port v0.1 with `connection.id` instead of hostname)
- [ ] T062 Write `src/app/(auth)/c/[id]/tables/page.tsx`
- [ ] T063 Write `src/app/(auth)/c/[id]/tables/[name]/page.tsx`
- [ ] T064 Write `src/app/(auth)/c/[id]/tables/[name]/new/page.tsx`
- [ ] T065 Write `src/app/(auth)/c/[id]/tables/[name]/[pk]/page.tsx`
- [ ] T066 Write `src/app/(auth)/c/[id]/schema/page.tsx`
- [ ] T067 Write `src/app/(auth)/c/[id]/settings/page.tsx`: connection settings (rename, role, delete)
- [ ] T068 Port `src/components/data/*`, `src/components/row/*` from v0.1 (swap imports)
- [ ] T069 Port `src/components/workspace/*` (Sidebar, Topbar, ErrorBoundary, EmptyState, RouteLoader)
- [ ] T070 Port `src/components/ui/*` (button, input, dialog, etc.): unchanged
- [ ] T071 Port `src/lib/forms/*` and `src/lib/table/*`: unchanged
- [ ] T072 Port `src/lib/errors.ts` (was api/errors.ts): unchanged
- [ ] T073 Port `src/components/auth/UserMenu.tsx`: avatar + sign-out (new)

## Phase 7: Polish & verify

- [ ] T080 Wire `useSession()` in Topbar so it shows the GitHub avatar
- [ ] T081 Add audit-log surfacing as Settings tab (read-only, last 50 writes): STRETCH
- [ ] T082 Manual smoke run against a real Supabase project per quickstart
- [ ] T083 Audit shipped bundles for any `apikey=` or `ey...` string leakage
- [ ] T084 README rewrite: SaaS quickstart, deploy notes, security model
- [ ] T085 Final typecheck + build; verify budgets
