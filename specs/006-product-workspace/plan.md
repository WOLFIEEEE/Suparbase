# Implementation Plan: Product Workspace

**Branch**: `006-product-workspace` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-product-workspace/spec.md`

## Summary

v0.6 is a coherent UX overhaul that drags every remaining "looks like a database admin" workspace surface up to the standard set by the Users archetype shipped in v0.5.1. Concretely: a redesigned connection Dashboard, a redesigned Tables list, rebuilds of `ContentAdmin` and `LogsAdmin` (plus their detail pages), a global Cmd/Ctrl+K command palette, a flash-free dark/light theme toggle, and a small sidebar polish pass. No new dependencies, no new schemas, no new API routes. Everything plugs into the existing `PageHeader`, `RowPresetRouter`, `TableAnalysis`, react-query hooks, and CSS-variable theme primitives.

Technical approach in one paragraph: the implementation is *almost entirely* React + Tailwind composition over types and data already in place. The only meaningfully new pieces of infrastructure are (a) a `theme` cookie with an SSR-readable initial class swap on `<html>` and a client-side toggle, and (b) a lazy-built in-memory command index that defers until the palette opens for the first time. Everything else is presentational: replacing existing components with archetype-aware layouts that read the AI analysis's `primary` / `hiddenColumns` / `relations` shape introduced in v0.5.1.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), React 19, Next.js 15.5 (App Router).

**Primary Dependencies**: Already in the bundle, all permitted per constitution Technology Standards:
- `@tanstack/react-query` v5: data fetching (existing hooks reused).
- `cmdk` v1: command palette (already installed for `components/ui/command.tsx`, currently unused at the workspace level).
- `@radix-ui/react-dialog`: palette modal + mobile nav (already used).
- `lucide-react`: icons.
- `class-variance-authority` + `tailwind-merge` + `clsx` via `cn()`: styling.
- `next/headers` (`cookies`): read the theme cookie on the server.
- No new dependencies are introduced.

**Storage**: Read-only access to existing tables. Reads from `audit_log` (rows for the active connection, scoped to the current user) for the Dashboard recent-activity panel. Reads `schema_analysis` cache via the existing `useAnalysis` hook. No migrations.

**Testing**: Manual smoke per constitution gate 4 (sign-in, create connection, browse a table, edit/delete a row, sign-out) plus the per-surface acceptance scenarios in the spec. The project does not run automated UI tests; `tsc --noEmit` and `next build` remain the gating checks.

**Target Platform**: Web: latest two stable versions of Chrome, Safari, Firefox, Edge. Self-hostable Next.js standalone container.

**Project Type**: Single Next.js app: `src/app` (routes), `src/components` (UI), `src/lib` (client logic + types), `src/server` (server-only). No new top-level directories.

**Performance Goals**: From the Constitution Principle I (NON-NEGOTIABLE):
- 60 fps for scroll / table render / modal transitions on a 2020-era laptop.
- Authenticated TTI ≤ 2.5s on warm cache.
- Total JS at first paint of any authenticated route ≤ 520 KB gzipped.
- Lists ≥ 1000 rows already use `@tanstack/react-virtual` via `DataGrid`; no change.

**Constraints**:
- Anti-AI-slop (Principle III): one accent color, no purple-blue gradients, no shadcn-dashboard look-alikes.
- Accessibility (Principle IV, NON-NEGOTIABLE): all new interactives keyboard-operable with visible focus; `prefers-reduced-motion` honoured.
- Server/client boundary (Principle VI): theme cookie read in the server-rendered root layout to avoid a flash of incorrect theme.
- Vault & proxy (Principle V, NON-NEGOTIABLE): every fetch of audit-log rows for the Dashboard MUST go through an authenticated server route that verifies connection ownership before reading.

**Scale/Scope**: Workspace renders on connections with up to ~200 tables; Dashboard recent-activity reads at most 10 audit-log rows; command palette indexes at most ~250 entries (connections + tables + actions + recent rows). All trivially within budget.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Performance First** (NON-NEGOTIABLE) | ✅ PASS | No new bundles. The command palette and ThemeProvider add < 5 KB gz combined (cmdk is already loaded by `components/ui/command.tsx`; the toggle is one component). The palette's data index is lazy: opening the dialog doesn't block on data fetches, results stream in via the existing react-query cache. Authenticated TTI unchanged because no new RSC fetches block the route. |
| **II. Motion Serves Comprehension** | ✅ PASS | Only two animations are introduced: (a) palette open/close (Radix Dialog default, reduced-motion respected by Radix), (b) a single brand moment on the Dashboard hero (a subtle accent gradient fade: pure CSS, gated by `@media (prefers-reduced-motion: reduce)`). Every other surface uses existing CSS transitions (hover row, focus ring). No GSAP introduced in workspace surfaces. |
| **III. Anti-AI-Slop Design** | ✅ PASS | The visual language continues the v0.5.1 Users archetype: `font-display` titles, single accent dot, hairline borders, no gradients in data surfaces. The Dashboard's hero accent gradient is a single 1-stop wash (not the forbidden purple-to-blue). Quick-action buttons are typographic with one accent fill: not a "three-card hero". |
| **IV. Accessibility** (NON-NEGOTIABLE) | ✅ PASS | Command palette: Radix Dialog + cmdk handle focus trap, keyboard navigation, and aria-haspopup. Theme toggle: `<button aria-pressed={isDark}>` with accessible label that includes the next state ("Switch to light"). Archetype/system disclosures use native `<details>` (semantic) with visible chevrons. Color contrast on archetype chips and accent backgrounds is verified against WCAG AA in both themes. |
| **V. Server-Side Vault & Proxy** (NON-NEGOTIABLE) | ✅ PASS | The Dashboard's recent-activity panel reads `audit_log` via a new authenticated server route (`GET /api/v/[id]/audit/recent?limit=10`) that verifies `connection.userId === session.user.id` before any DB read. Audit rows already exist; no schema change. No proxy changes. The command palette does not touch any vaulted secret. |
| **VI. Clean Code Discipline** | ✅ PASS | New modules added under existing folders only: `src/components/workspace/` (CommandPalette, ThemeToggle, ThemeProvider), `src/components/presets/` (ContentAdmin v2, ContentDetail, LogsAdmin v2, LogDetail), `src/server/audit/recent.ts`, `src/app/api/v/[id]/audit/recent/route.ts`. Server-only modules stay under `src/server/`. Client modules carry `"use client"`. Old `ContentAdmin.tsx` / `LogsAdmin.tsx` are replaced in place; the old `Dashboard.tsx` is rewritten. No new abstraction without a second concrete caller. |
| **VII. Data & Security** (NON-NEGOTIABLE) | ✅ PASS | The audit-log fetch returns redacted payloads (the redactor already strips JWTs / `sk-or-*` / `sk-*` / bcrypt hashes). No new secrets are stored. Rate limit on the audit endpoint reuses the existing per-user token bucket. Theme cookie is a non-sensitive preference (`SameSite=Lax`, no `Secure` required since it carries no auth). |
| **VIII. Account & Tenancy** | ✅ PASS | Every new server read filters by `connection.userId = session.user.id`. The command palette's "Connections" group lists only the current user's connections, served from the existing `useConnections` hook. No cross-tenant data is reachable. |
| **IX. AI Assistance** | ✅ PASS | Every archetype-aware surface degrades gracefully when no AI analysis is cached: the heuristic fallback's `category` + `displayName` + (newly added) `primary`/`hiddenColumns`/`relations` cover offline mode. No new LLM calls are introduced; the existing analyze flow is reused. |

**Gate result**: PASS. No violations to justify; Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/006-product-workspace/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0: design decisions resolved
├── data-model.md        # Phase 1: types/contracts the feature reads
├── quickstart.md        # Phase 1: how to verify the feature end-to-end
├── contracts/
│   └── audit-recent.md  # The one new authenticated server route
└── checklists/
    └── requirements.md  # Spec quality checklist (already populated)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/
│   │   └── c/[id]/
│   │       ├── page.tsx                 # Dashboard route: rewritten body
│   │       ├── tables/page.tsx          # Tables list: rewritten body
│   │       └── tables/[name]/[pk]/page.tsx  # Row detail (already RowPresetRouter)
│   ├── api/
│   │   └── v/[id]/audit/recent/route.ts # NEW: 10 most recent audit rows for connection
│   └── layout.tsx                       # Reads theme cookie, sets <html data-theme>
├── components/
│   ├── workspace/
│   │   ├── Dashboard.tsx                # REWRITTEN: archetype hero + groups + recent activity
│   │   ├── TablesList.tsx               # REWRITTEN: archetype groups + search + system disclosure
│   │   ├── Sidebar.tsx                  # POLISHED: counts, active state, AI subtitle
│   │   ├── Topbar.tsx                   # MODIFIED: adds ThemeToggle + Cmd+K hint
│   │   ├── PageHeader.tsx               # EXISTING: reused everywhere
│   │   ├── RowPresetRouter.tsx          # MODIFIED: route content + logs to new components
│   │   ├── CommandPalette.tsx           # NEW: cmdk-driven palette mounted in connection layout
│   │   ├── ThemeProvider.tsx            # NEW: client provider that owns toggle + cookie write
│   │   └── ThemeToggle.tsx              # NEW: Topbar button (aria-pressed)
│   ├── presets/
│   │   ├── ContentAdmin.tsx             # REWRITTEN: PageHeader + cards + route to detail
│   │   ├── ContentDetail.tsx            # NEW: hero + body + relations sidebar
│   │   ├── LogsAdmin.tsx                # REWRITTEN: time-grouped event stream
│   │   ├── LogDetail.tsx                # NEW: timestamp hero + pretty payload + actor card
│   │   └── shared/PresetHeader.tsx      # DELETED: superseded by PageHeader
│   └── ui/
│       └── command.tsx                  # EXISTING: cmdk primitive (already present)
├── lib/
│   ├── theme/
│   │   ├── cookie.ts                    # NEW: read/write theme cookie (server + client safe)
│   │   └── types.ts                     # NEW: type Theme = "light" | "dark" | "system"
│   ├── presets/
│   │   ├── heuristic.ts                 # EXISTING: extended in v0.5.1
│   │   └── pick.ts                      # EXISTING
│   └── ui/
│       └── time.ts                      # EXISTING: relativeFromNow
└── server/
    └── audit/
        └── recent.ts                    # NEW: fetch recent audit rows by connectionId+userId
```

**Structure Decision**: Continue the single-app layout the project has used since v0.2. No new top-level directories. Server-only code lives under `src/server/`; route handlers are thin and call into it. Client components carry `"use client"` and never import server modules. The plan deletes the old `presets/shared/PresetHeader.tsx` once all four presets have migrated to `PageHeader`: leaving it would violate Principle VI (no abstraction without a second caller).

## Complexity Tracking

No constitution violations to justify. Section intentionally empty.
