# Implementation Plan: Suparbase: Auto-Admin for Supabase

**Branch**: `001-supabase-admin` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-supabase-admin/spec.md`

## Summary

A client-only SPA that connects directly to a user-supplied Supabase project,
introspects its public schema via PostgREST's OpenAPI document, and renders a
working admin dashboard: per-table data grids with sort/search/pagination,
type-aware create/edit forms with FK pickers and JSON editing, deletion with
undo, a schema overview, and connection management. No first-party backend :
every request goes from the user's browser to their Supabase host.

## Technical Context

**Language/Version**: TypeScript 5.4+, React 18.3+, Node 20 LTS (build only)

**Primary Dependencies**:
- Build: Vite 5.x, `@vitejs/plugin-react`
- UI: React 18, react-dom, Tailwind CSS 3.4, shadcn/ui (Radix primitives), Lucide icons,
  `clsx`, `tailwind-merge`, `class-variance-authority`
- Data: `@supabase/supabase-js` v2, `@tanstack/react-query` v5,
  `@tanstack/react-table` v8, `@tanstack/react-virtual` v3
- Routing: `react-router-dom` v6
- Forms: `react-hook-form` v7, `@hookform/resolvers`, `zod` v3
- Motion (landing/connect only): `gsap` 3, `@gsap/react`
- Utilities: `date-fns`, `sonner` (toasts), `nanoid`
- Fonts: self-hosted `@fontsource-variable/*` (Geist Sans + Geist Mono +
  Fraunces for landing accent)

**Storage**: User's own Supabase project (we do NOT persist user data). App
state in URL query string + React Query cache. Connection credentials in
`sessionStorage` (default) or `localStorage` (opt-in).

**Testing**: `tsc --noEmit` and `vite build` as automated gates. Manual smoke
checklist against a real Supabase project (provided by the developer running
the workflow). No unit-test framework in v1: justified in Complexity Tracking.

**Target Platform**: Modern evergreen browsers (latest two stable Chrome /
Safari / Firefox / Edge) on desktop and tablet. Mobile (<768px) is read-only.

**Project Type**: Single-project static web application (Option 1).

**Performance Goals**:
- Lighthouse landing/connect: Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95
- Schema introspection round-trip: ≤ 3s for ≤ 50 tables × 100 columns
- Table list first paint after navigation: ≤ 1s for up to 1,000 rows
- Sort/search/page interactions: ≤ 600ms perceived

**Constraints**:
- Initial JS payload (landing route): ≤ 220KB gzipped (lazy-load workspace)
- Total JS payload (workspace + landing combined): ≤ 480KB gzipped at any
  first-paint
- Initial CSS payload: ≤ 80KB gzipped
- Honor `prefers-reduced-motion: reduce`
- WCAG AA contrast

**Scale/Scope**: 1 connect surface + 6 workspace routes; targets schemas up to
50 tables × 100 columns × 100k rows (lists paginated, server-side filtered).
Source target: ~6,000–8,000 LOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First (NON-NEG) | PASS | Workspace lazy-loaded behind connection; data tables virtualized for >50 rows; React Query for cache + dedupe; no global re-render on URL state changes (URL state read at route level). |
| II. Motion Serves Comprehension | PASS | GSAP scoped to the connect screen and route transitions; in-app micro-interactions use Radix/CSS transitions. Each animation has a reduced-motion fallback. |
| III. Anti-AI-Slop Design | PASS | Custom Fraunces accent on landing distinguishes from "another shadcn dashboard"; intentional grid layout for the dashboard (not the default Linear-clone sidebar); one phosphor-green accent. |
| IV. Accessibility (NON-NEG) | PASS | Built on Radix primitives (keyboard + a11y by default); every form field has a label; data grid is keyboard-navigable; focus rings via Tailwind utilities tied to the accent. |
| V. Client-Only SPA, BYOB (NON-NEG) | PASS | Zero server code; credentials never leave browser → user's Supabase. Static `dist/` deployable anywhere. |
| VI. Clean Code Discipline | PASS | Introspection (`src/lib/schema/`), data access (`src/lib/api/`), form generation (`src/lib/forms/`), table generation (`src/lib/table/`) live in dedicated modules. Views are thin. |
| VII. Data & Security (NON-NEG) | PASS | JWT role detection client-side; service-role key gated behind explicit warning + checkbox; keys never logged; Disconnect clears both storages; destructive ops gated by confirmation; delete has 5s undo. |

**Result**: PASS: proceeding to Phase 0.

**Re-check after Phase 1 design**: PASS: Phase 1 introduced no new violations.
The form-generation and table-generation modules are data-driven from the
introspected schema (Principle VI: no per-table duplication).

## Project Structure

### Documentation (this feature)

```text
specs/001-supabase-admin/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── schema-introspection.md
│   ├── data-access.md
│   └── route-map.md
├── checklists/
│   └── requirements.md
└── tasks.md          # produced by /speckit-tasks
```

### Source Code (repository root)

```text
.
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json                # shadcn/ui registry config
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx                   # bootstrap React, mount router
    ├── App.tsx                    # router shell + providers (QueryClient, Toaster)
    ├── index.css                  # tailwind layers + tokens
    ├── routes/
    │   ├── ConnectRoute.tsx       # "/" : connect screen
    │   ├── DashboardRoute.tsx     # "/dashboard"
    │   ├── TablesRoute.tsx        # "/tables" (list of tables)
    │   ├── TableListRoute.tsx     # "/tables/:name"
    │   ├── TableNewRoute.tsx      # "/tables/:name/new"
    │   ├── TableRowRoute.tsx      # "/tables/:name/:pk"
    │   ├── SchemaRoute.tsx        # "/schema"
    │   ├── SettingsRoute.tsx      # "/settings"
    │   ├── RequireConnection.tsx  # guard component
    │   └── WorkspaceLayout.tsx    # sidebar + topbar shell
    ├── lib/
    │   ├── connection/
    │   │   ├── store.ts           # connection in session/localStorage
    │   │   ├── jwt.ts             # JWT role decode
    │   │   └── validate.ts        # URL/key validators
    │   ├── supabase/
    │   │   ├── client.ts          # supabase-js client factory
    │   │   └── openapi.ts         # fetch + types for OpenAPI doc
    │   ├── schema/
    │   │   ├── introspect.ts      # parse OpenAPI → Schema
    │   │   ├── types.ts           # Schema, Table, Column types
    │   │   ├── labelColumn.ts     # pick human label column
    │   │   ├── fkParser.ts        # parse FK from description text
    │   │   └── typeMap.ts         # map pg types → category
    │   ├── api/
    │   │   ├── rows.ts            # list/get/insert/update/delete row helpers
    │   │   ├── count.ts           # row-count via HEAD + Range-Unit
    │   │   └── reference.ts       # FK reference picker queries
    │   ├── forms/
    │   │   ├── buildSchema.ts     # zod schema from Column[]
    │   │   ├── buildDefaults.ts   # initial values from Column[]
    │   │   └── fields/            # FieldText, FieldBool, FieldJson, FieldFk, ...
    │   ├── table/
    │   │   ├── buildColumns.ts    # tanstack column defs from Column[]
    │   │   └── cells/             # type-specific cell renderers
    │   ├── motion/
    │   │   ├── gsap.ts            # plugin registration, eases
    │   │   └── useReducedMotion.ts
    │   └── ui/
    │       └── cn.ts              # clsx + tailwind-merge
    ├── components/
    │   ├── ui/                    # shadcn-generated primitives (Button, Dialog, Input, Switch, Select, Tabs, Toast, ScrollArea, Table, Tooltip, Drawer, DropdownMenu, Badge, Skeleton)
    │   ├── connect/
    │   │   ├── ConnectForm.tsx
    │   │   ├── ServiceRoleWarning.tsx
    │   │   └── ConnectHero.tsx    # GSAP'd landing copy
    │   ├── workspace/
    │   │   ├── Sidebar.tsx
    │   │   ├── Topbar.tsx
    │   │   └── EmptyState.tsx
    │   ├── data/
    │   │   ├── DataGrid.tsx
    │   │   ├── DataGridToolbar.tsx
    │   │   ├── PaginationBar.tsx
    │   │   └── FkBadge.tsx
    │   ├── row/
    │   │   ├── RowForm.tsx        # builds form from Column[]
    │   │   ├── RowDrawer.tsx
    │   │   └── DeleteRowDialog.tsx
    │   └── schema/
    │       └── SchemaList.tsx
    └── types/
        └── shared.ts
```

**Structure Decision**: Single-project static SPA, organized by intent: `routes/`
holds route components, `lib/` holds pure logic + data access modules,
`components/` holds reusable UI grouped by domain. Schema-driven form and table
generation live in `lib/forms/` and `lib/table/`: view components consume them
and do not know about specific tables.

## Complexity Tracking

| Decision | Why | Simpler Alternative Rejected Because |
|----------|-----|--------------------------------------|
| No unit-test framework in v1 | Correctness gates are `tsc --noEmit`, `vite build`, and a manual smoke checklist against a real Supabase project. Integration with a live PostgREST is where the value sits; mocking it for Vitest produces tests that pass while the app is broken. | Vitest + msw would test serialization/deserialization shims, not the real failure modes (OpenAPI parsing edge cases, RLS interactions, FK detection). v2 may add Playwright against a seeded local Supabase. |
| React Query + URL state (no Zustand/Redux) | Server state lives in React Query; navigable state lives in the URL. No additional store needed. | A client store would duplicate query cache and risk staleness. |
| shadcn/ui rather than hand-rolled primitives | Radix gives a11y and keyboard behavior for free across Dialog, Drawer, Tabs, Tooltip, DropdownMenu, Select: building these correctly from scratch is weeks. | Hand-rolling primitives loses focus-trap, ARIA, and keyboard handling: direct conflict with Principle IV. |
