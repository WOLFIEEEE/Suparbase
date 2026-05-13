---

description: "Task list for v0.6 Product Workspace"
---

# Tasks: Product Workspace

**Input**: Design documents from `/specs/006-product-workspace/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/audit-recent.md](./contracts/audit-recent.md), [quickstart.md](./quickstart.md)

**Tests**: NOT requested. This release is UI composition with no new server-side business logic beyond a single thin read endpoint; the project's gating checks remain `tsc --noEmit`, `next build`, and the manual smoke path in `quickstart.md`.

**Organization**: Tasks are grouped by user story (US1–US7) per spec.md. Stories are sequenced by priority: US1, US2, US3 are P1 (must-have); US4, US5 are P2; US6, US7 are P3. After Foundational, every story can be worked in parallel by separate developers — no story depends on another's implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — runnable in parallel with other [P] tasks (different files, no dependencies on incomplete tasks).
- **[Story]** — user-story tag (US1–US7); omitted for Setup, Foundational, and Polish tasks.
- File paths are absolute from repo root.

## Path Conventions

Single Next.js app (per [plan.md](./plan.md) Project Structure):
- `src/app/` — routes (App Router)
- `src/components/` — UI (client components carry `"use client"`)
- `src/lib/` — types, helpers, client-side data hooks
- `src/server/` — server-only modules (never imported from client)

---

## Phase 1: Setup

**Purpose**: confirm the working tree is green before touching anything.

- [x] T001 Run `pnpm typecheck` from repo root to confirm `tsc --noEmit` is currently green on branch `006-product-workspace`. Abort if not.

---

## Phase 2: Foundational

**Purpose**: shared primitives that more than one user story depends on. **No user-story work begins until this phase is complete.**

- [x] T002 [P] Create `src/lib/presets/groupTables.ts` exporting `groupTablesByArchetype(tables: Table[], analyses: TableAnalysis[] | undefined): { users: Table[]; content: Table[]; logs: Table[]; generic: Table[]; system: Table[] }`. Use `pickPreset` from `src/lib/presets/pick.ts` for each table. `system` is any table whose `schema` is `"auth"` or `"storage"`. Pure function, no React. Used by Dashboard (US1) and TablesList (US2).

- [x] T003 [P] Create `src/lib/theme/types.ts` exporting `export type Theme = "light" | "dark" | "system"` and `THEME_COOKIE = "suparbase-theme"`.

- [x] T004 Create `src/lib/theme/cookie.ts` with two helpers: `readThemeCookie(cookieStore: ReadonlyRequestCookies): Theme | null` (server, takes the value from `next/headers`'s `cookies()`) and `writeThemeCookie(theme: Theme): void` (client, sets `document.cookie` with `SameSite=Lax`, `Max-Age=31536000`, and `Secure` when `location.protocol === "https:"`). Depends on T003.

- [x] T005 Update `src/app/layout.tsx` to read the theme cookie via `cookies()` and emit `<html data-theme="light">` or `<html data-theme="dark">` based on the value (no attribute when absent or `"system"`). Depends on T004.

- [x] T006 Verify both light and dark CSS variable blocks exist in `src/app/globals.css` (`:root` for one, `[data-theme="dark"]` for the other). If only dark exists, add a light palette using the existing CSS variable names (`--bg`, `--bg-raised`, `--bg-sunken`, `--fg`, `--fg-muted`, `--fg-faint`, `--accent`, `--line`, `--line-strong`, `--warn`, `--danger`) tuned for WCAG AA contrast. Do not touch any other CSS layer.

- [x] T007 [P] Create `src/server/audit/recent.ts` exporting `fetchRecentAudit(userId: string, connectionId: string, limit: number): Promise<AuditRow[]>` that uses the Drizzle client to query `audit_log` filtered by `userId AND connectionId`, ordered by `createdAt DESC`, limited to `Math.min(Math.max(limit, 1), 25)`. Server-only.

- [x] T008 Create `src/app/api/v/[id]/audit/recent/route.ts` exporting a `GET` handler. Resolve the NextAuth session; on missing/invalid session return `AppError("unauthorized", 401)`. Verify connection ownership via the existing `getConnectionForUser(session.user.id, params.id)`; on miss return `404 { category: "not_found" }`. Parse `?limit` (default 10, max 25). Call `fetchRecentAudit` from T007. Apply the existing per-user proxy rate limit (`src/server/proxy/ratelimit.ts`); on exceed return `429`. Return `{ entries: AuditRow[] }` with header `Cache-Control: private, no-store`. Depends on T007. Contract: [contracts/audit-recent.md](./contracts/audit-recent.md).

**Checkpoint**: Foundation ready. User story work may now proceed in parallel.

---

## Phase 3: User Story 1 — Dashboard (Priority: P1) 🎯 MVP

**Goal**: A connection home that explains the project in product terms — hero stats, archetype-grouped table sections with AI display names, recent-activity panel from the audit log, and 3–4 quick-action buttons. The hostname is demoted; the connection's friendly name is the page title.

**Independent Test**: Visit `/c/{id}` on a connection that has at least one users-classified table and one logs-classified table. Quickstart §1 checklist passes end-to-end.

### Implementation for User Story 1

- [x] T009 [US1] Add `useRecentAudit(connectionId: string | undefined, limit = 10)` to `src/lib/api/hooks.ts` — react-query hook fetching `/api/v/{id}/audit/recent?limit=N`. `staleTime: 30_000`, `gcTime: 5 * 60_000`. Returns `{ entries: AuditRow[] }`. Depends on T008.

- [x] T010 [P] [US1] Create `src/components/workspace/dashboard/StatStrip.tsx` — client component that takes `{ tables, analyses, useRowCount }` and renders 4 archetype tiles using the existing `StatTile` from `PageHeader.tsx`. Tiles render only when a matching archetype exists; absent archetypes fall back to "Other tables" with the generic count.

- [x] T011 [P] [US1] Create `src/components/workspace/dashboard/ArchetypeGroup.tsx` — client component that takes `{ title, icon, tables, analyses, connectionId }` and renders the section header (with count) and a responsive 3-column grid of `TableTile` cards (reusing `src/components/data/TableTile.tsx`).

- [x] T012 [P] [US1] Create `src/components/workspace/dashboard/RecentActivity.tsx` — client component that calls `useRecentAudit(connectionId, 10)`, renders a vertical list of entries (verb chip, table name, time-ago via `relativeFromNow`, deep link to row when `primaryKey` is non-null), or an empty-state card with copy "Audit logging populates as you edit rows."

- [x] T013 [P] [US1] Create `src/components/workspace/dashboard/QuickActions.tsx` — client component that takes `{ connectionId, usersTable: Table | null, hasAiKey: boolean }` and renders 3–4 `<Button asChild>` links: "Open settings" (always), "Invite user" (deep link to the users table's `/new` route when present), "Run AI analysis" (only when `hasAiKey`), and an optional fourth action like "Recent activity" anchor scroll.

- [x] T014 [US1] Rewrite `src/components/workspace/Dashboard.tsx`: replace existing body with the `PageHeader` chrome (title = connection name from the layout-supplied `connection.name`, subtitle = `connection.hostname`, eyebrow = accent dot + "dashboard"), `<StatStrip>`, archetype-grouped `<ArchetypeGroup>` sections using `groupTablesByArchetype` from T002, `<RecentActivity>`, and `<QuickActions>`. Render an explicit empty state when `schema.tables.length === 0`. Honour `prefers-reduced-motion` for any landing-style flourish. Depends on T002, T009–T013.

- [x] T015 [US1] Manual smoke against [quickstart.md](./quickstart.md) §1. All checkboxes pass. Run `pnpm typecheck`; green.

**Checkpoint**: US1 is independently demoable. The new Dashboard reads `/c/{id}`.

---

## Phase 4: User Story 2 — Tables list (Priority: P1)

**Goal**: Tables grouped by archetype with named sections ("People / Library / Activity / Everything else"), `auth.*` / `storage.*` collapsed under a system-tables disclosure, and a search that filters every section in place.

**Independent Test**: Visit `/c/{id}/tables` on a connection with tables across multiple archetypes. Quickstart §2 checklist passes.

### Implementation for User Story 2

- [x] T016 [US2] Rewrite `src/components/workspace/TablesList.tsx`: replace the existing alphabetical tile grid with: `PageHeader` chrome (title "Tables", breadcrumb back to `/c/{id}`), a search input that filters across all sections by table name, archetype-named sections (People / Library / Activity / Everything else) using `groupTablesByArchetype` from T002 — each section's heading hidden when zero matches — and a closed `<details>` "System tables (N)" disclosure at the bottom containing every table from the `system` group. Reuse `TableTile` from `src/components/data/TableTile.tsx`. Depends on T002.

- [x] T017 [US2] Manual smoke against [quickstart.md](./quickstart.md) §2. All checkboxes pass.

**Checkpoint**: US2 is independently demoable. The Tables route now matches Users-archetype chrome.

---

## Phase 5: User Story 3 — Content archetype (Priority: P1)

**Goal**: Content tables (posts, articles, docs) feel like a CMS: PageHeader chrome, stat tiles, opinionated row cards (title + status + author + published-at), and a dedicated detail page with a title hero, body rendered as readable wrapped text, and a Linked-records sidebar.

**Independent Test**: Visit a content-classified table. Quickstart §3 checklist passes.

### Implementation for User Story 3

- [x] T018 [P] [US3] Rewrite `src/components/presets/ContentAdmin.tsx`: drop the old `PresetHeader` import, mount `PageHeader` with breadcrumbs (`Tables` → `displayName`), AI eyebrow, and "New post" primary action when `table.kind === "table" && primaryKey.length > 0`. Stat tiles via `StatTile`: total items, draft/published split (only when a status column exists), "Newest first" hint. Row cards mirror `UsersAdmin.tsx` layout — title prominent via `analysis.primary.titleColumn`, status pill aligned right via `analysis.primary.badgeColumn`, subtitle row from `analysis.primary.subtitleColumn` + author label from `analysis.relations` + published-at via `relativeFromNow`. Click navigates to `/c/{id}/tables/{name}/{pk}` (no drawer). Action menu via existing `DropdownMenu` primitive (Open / Edit / Email author when applicable).

- [x] T019 [P] [US3] Create `src/components/presets/ContentDetail.tsx`: mirror the file layout of `UserDetail.tsx`. Hero block has title at display-size (`text-display-lg` or equivalent), metadata row (status pill + author link + published-at + updated-at), and the `bodyColumn` rendered in a `<div>` with `whiteSpace: "pre-wrap"`, `wordBreak: "break-word"`, inherit font. Two-column body with sections (Identifiers / Metadata / Other, deduping the hero columns and respecting `analysis.hiddenColumns`) on the left and a Linked-records sidebar on the right (incoming FKs across the schema, identical to UserDetail). Include the Edit / Delete actions via `RowForm` + `DeleteRowDialog` with undo. Default export.

- [x] T020 [US3+US4] Update `src/components/workspace/RowPresetRouter.tsx` once to wire **both** detail components: import `ContentDetail` and `LogDetail` via `next/dynamic`; when `preset === "content"` render `<ContentDetail ... />`, when `preset === "logs"` render `<LogDetail ... />` (else fall through to `TableRowView`). This single task replaces what would have been two same-file edits in US3 and US4 and removes the merge hotspot called out in `/speckit-analyze` finding F1. Depends on T019 and T023; whichever lands second commits the change.

- [x] T021 [US3] Manual smoke against [quickstart.md](./quickstart.md) §3. All checkboxes pass.

**Checkpoint**: US3 is independently demoable. Content tables and content rows now feel like a CMS.

---

## Phase 6: User Story 4 — Logs archetype (Priority: P2)

**Goal**: Logs tables (events, audit, webhooks) render as a time-grouped event stream — day-bucket headers, event-type chips, collapsed jsonb payloads — with a detail page that prioritizes timestamp and pretty-prints the payload.

**Independent Test**: Visit a logs-classified table with rows spanning multiple days. Quickstart §4 checklist passes.

### Implementation for User Story 4

- [x] T022 [P] [US4] Rewrite `src/components/presets/LogsAdmin.tsx`: drop `PresetHeader`, mount `PageHeader` with stat tiles (total events, events in last 24h, events in last 7d, distinct event types — each tile gracefully degrades when its column is absent). Pick the timestamp column from `analysis.primary.titleColumn` if it's a date type, then fall back to `created_at` / `inserted_at` / any `*_at`. Group rendered rows by day bucket: "Today" (today), "Yesterday" (today-1), "This week" (today-6 to today-2), "Earlier" (older). Each row card shows event-type column as a `StatusPill`-style chip, actor relation as a labeled link, and the timestamp as `relativeFromNow` with absolute on hover. Any jsonb column collapses to a single-line preview (`JSON.stringify(value).slice(0, 80) + "…"`) — clicking it toggles an inline expanded `<pre>`. When no timestamp column exists, render a single warning banner ("no timestamp column found — events are not time-ordered") above an ungrouped ordered list (per [research.md Decision 7](./research.md)).

- [x] T023 [P] [US4] Create `src/components/presets/LogDetail.tsx`: hero block leads with the timestamp (absolute date + `relativeFromNow` subtitle), event-type chip, actor relation rendered as a `LinkedRecordCard` (small reusable component or inline JSX matching UserDetail's relations sidebar). Pretty-print the payload as `JSON.stringify(parsed, null, 2)` inside a `<pre class="surface-sunken">`. Two-column layout (main / relations) mirroring `ContentDetail`. Default export.

- [x] T024 [US4] *(merged into T020 — see `/speckit-analyze` finding F1.)* No-op placeholder kept for ID stability; T020 now wires both `ContentDetail` and `LogDetail` in a single edit.

- [x] T025 [US4] Manual smoke against [quickstart.md](./quickstart.md) §4. All checkboxes pass.

**Checkpoint**: US4 is independently demoable. Logs feel like an activity stream.

---

## Phase 7: User Story 5 — Command palette (Priority: P2)

**Goal**: Cmd/Ctrl+K opens a keyboard-driven palette from anywhere in the workspace. It indexes connections, tables (with AI display names), settings pages, and a small action set. Lazy data fetch — opening is instant.

**Independent Test**: Press Cmd+K from any `/c/{id}/*` route. Quickstart §5 checklist passes.

### Implementation for User Story 5

- [x] T026 [US5] Create `src/components/workspace/CommandPalette.tsx`: a client component built on Radix Dialog + the existing `src/components/ui/command.tsx` (cmdk wrapper). Mount a global keyboard listener for `(e.metaKey || e.ctrlKey) && e.key === "k"` that opens the dialog. Inside, groups: "Tables" (from `useSchema(connectionId)` decorated with `useAnalysis(connectionId)` display names), "Connections" (from `useConnections()`), "Settings" (static: AI assistance, Connection settings, Account), "Actions" (Run AI analysis when an OpenRouter key is configured, Toggle theme, Sign out). Each group renders an empty-state row while its query is loading. Selecting a navigable item closes the dialog and `router.push`'s the href. Action items run their handler and close the dialog.

- [x] T027 [US5] Mount `<CommandPalette />` in `src/app/(auth)/c/[id]/layout.tsx` once, inside the `CurrentConnectionProvider`, so the palette is available on every workspace route. Depends on T026.

- [x] T028 [US5] Manual smoke against [quickstart.md](./quickstart.md) §5. All checkboxes pass — particularly the lazy-index behaviour and the keyboard-only flow.

**Checkpoint**: US5 is independently demoable. Cmd+K works.

---

## Phase 8: User Story 6 — Theme toggle (Priority: P3)

**Goal**: A theme toggle in the Topbar flips between light and dark, persists via cookie, and never produces a flash on the next page load. Defaults to `prefers-color-scheme` when no preference is set.

**Independent Test**: Toggle the theme, navigate, reload. Quickstart §6 checklist passes.

### Implementation for User Story 6

- [x] T029 [P] [US6] Create `src/components/workspace/ThemeToggle.tsx`: a client `"use client"` component that reads the current theme from a small `useTheme()` hook (which reads `document.documentElement.dataset.theme` at mount, defaults to `"system"`) and renders a `<button>` with `aria-pressed={isDark}` and an accessible label naming the *next* state ("Switch to light"). On click: update `document.documentElement.dataset.theme` optimistically and call `writeThemeCookie` from T004. Icon: `Sun` when in dark mode, `Moon` when in light. No animation beyond the existing CSS transition on `color` / `background-color`.

- [x] T030 [US6] Mount `<ThemeToggle />` in `src/components/workspace/Topbar.tsx` to the left of the account dropdown. Depends on T029.

- [x] T031 [US6] Manual smoke against [quickstart.md](./quickstart.md) §6. Particularly verify no theme flash on reload after a toggle, and that focus and `aria-pressed` are correct.

**Checkpoint**: US6 is independently demoable. Theme persists; SSR renders the chosen theme.

---

## Phase 9: User Story 7 — Sidebar polish (Priority: P3)

**Goal**: Sidebar items show inline counts; the active item is accent-tinted with a left-edge indicator; the AI footer link shows last-used model and token total when an analysis is cached.

**Independent Test**: Quickstart §7 checklist passes.

### Implementation for User Story 7

- [x] T032 [US7] Update `src/components/workspace/Sidebar.tsx`: extend `SidebarNav` to read `useSchema(connectionId)` and surface counts (Tables = `schema.tables.length`, Schema = total column count `schema.tables.reduce((n, t) => n + t.columns.length, 0)`); use a small muted badge to the right of the item label. Update the active-state class to add a `bg-accent/10`, accent-tinted text, and a 2px left-edge `border-l-accent` indicator. Update the "AI assistance" footer link to read the AI settings (existing `useAiSettings` or equivalent); render `{model} · {tokens.toLocaleString()} tok` as a muted subtitle when an analysis is cached; show nothing extra otherwise. Preserve all existing behaviour, including `onNavigate` and the mobile-nav variant.

- [x] T033 [US7] Manual smoke against [quickstart.md](./quickstart.md) §7.

**Checkpoint**: All seven user stories complete and independently demoable.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T034 [P] Delete `src/components/presets/shared/PresetHeader.tsx` once US1, US2, US3, and US4 are merged in. Verify zero remaining imports with `rg -n "shared/PresetHeader" src/`.

- [x] T035 [P] Remove the `RowDrawer` import from `ContentAdmin.tsx` and `LogsAdmin.tsx` if it remains (drawer pattern is removed from those archetypes per spec SC-008). `UsersAdmin.tsx` already removed it; the `RowDrawer.tsx` component itself stays (Generic admin may still use it).

- [x] T036 Run `pnpm typecheck`. Fix any errors. Green output required.

- [x] T037 Run `pnpm build`. Verify it succeeds. Inspect the Next.js build output for the largest first-paint JS bundle on an authenticated route — confirm it remains ≤ 520 KB gzipped per Constitution Principle I. Record the measurement in the PR description.

- [x] T038 Walk the full [quickstart.md](./quickstart.md) checklist top to bottom (sections §1 through §9) on a connection with at least one table per archetype and at least one prior write recorded in the audit log. All checkboxes pass.

- [x] T039 Update `CHANGELOG.md` with a new section for v0.6 — "Product workspace": the Dashboard / Tables list redesign, Content + Logs preset rebuilds, command palette, theme toggle, sidebar polish, the new `/api/v/[id]/audit/recent` route, no schema migration. Reference the spec at `specs/006-product-workspace/`.

- [x] T040 Commit on `006-product-workspace`, then open a PR to `main`. The PR description quotes the success criteria from [spec.md](./spec.md) §"Success Criteria" and the bundle measurement from T037.

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup
  ↓
Phase 2 Foundational  ◄── blocks every user story below
  ↓
Phase 3 US1 (P1, MVP) ─┐
Phase 4 US2 (P1)       ├── independently parallel after Foundational
Phase 5 US3 (P1)       │
Phase 6 US4 (P2)       │
Phase 7 US5 (P2)       │
Phase 8 US6 (P3)       │
Phase 9 US7 (P3)       │
  ↓
Phase 10 Polish        ── runs after all stories merged
```

### Inter-task dependencies (foundational)

- T004 ← T003
- T005 ← T004
- T008 ← T007
- (T009 in US1 ← T008)
- (T014 in US1 ← T002, T009, T010, T011, T012, T013)
- (T016 in US2 ← T002)
- (T020 in US3 ← T019)
- (T024 in US4 ← T023)
- (T027 in US5 ← T026)
- (T030 in US6 ← T029)

Polish (Phase 10) requires every user story merged.

### Parallel opportunities

After T001 (Setup), Phase 2 has high parallelism:

- T002, T003, T007 in parallel (different files, no dependencies on each other).
- T004 sequenced after T003; T005 after T004; T006 standalone (the CSS check); T008 after T007.

Inside each user story, leaf component tasks are marked [P] and may be built in parallel:

- US1: T010, T011, T012, T013 [P] then T014 integrates them.
- US3: T018 [P] (list) and T019 [P] (detail) are independent.
- US4: T022 [P] and T023 [P] are independent.

Across stories, after Foundational completes, **all seven user-story phases can run concurrently** if multiple developers are available.

---

## Parallel example — Phase 2 Foundational

```bash
# Fan out:
Task: "T002 Create groupTablesByArchetype helper"
Task: "T003 Create theme types"
Task: "T007 Create fetchRecentAudit server module"
# After T003 lands:
Task: "T004 Create theme cookie helpers"
Task: "T006 Verify globals.css both themes"
# After T004 lands:
Task: "T005 Wire theme cookie into app/layout.tsx"
# After T007 lands:
Task: "T008 Create /api/v/[id]/audit/recent route handler"
```

## Parallel example — Phase 3 US1 Dashboard

```bash
# Once Foundational is done:
Task: "T009 Add useRecentAudit hook"   # after T008
Task: "T010 [P] StatStrip component"
Task: "T011 [P] ArchetypeGroup component"
Task: "T012 [P] RecentActivity component"
Task: "T013 [P] QuickActions component"
# Once all of T009-T013 land:
Task: "T014 Rewrite Dashboard.tsx assembling the above"
Task: "T015 Smoke quickstart §1"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundational.
3. Complete Phase 3 US1 Dashboard.
4. **STOP and validate** — quickstart §1 + §8 (constitution gates) + §9 (regression).
5. Demo / merge as the MVP. Everything beyond US1 is incremental.

### Incremental delivery

After MVP, ship in spec priority order:

- US2 Tables list (P1) — completes the "every page uses PageHeader" promise.
- US3 Content archetype (P1) — completes the "every archetype matches Users" promise.
- US4 Logs archetype (P2).
- US5 Command palette (P2).
- US6 Theme toggle (P3).
- US7 Sidebar polish (P3).

Each story is independently mergeable. Polish (Phase 10) runs once the last story merges.

### Parallel team strategy

With multiple developers and Foundational complete:

- Dev A: US1 → US3 (the two largest P1s — Dashboard and Content).
- Dev B: US2 → US4 (Tables list, then Logs).
- Dev C: US5 → US6 → US7 (palette, theme, sidebar — the smaller surfaces).

No story integrates with another at the implementation level, so merge-order risk is low.

---

## Notes

- Total tasks: **40**.
- Per-story counts: US1=7, US2=2, US3=4, US4=4, US5=3, US6=3, US7=2. Setup=1, Foundational=7, Polish=7.
- Independent test for every story is the corresponding quickstart section.
- Suggested MVP scope: **US1 + Foundational + Setup** (15 tasks) — enough to demo the visual leap on the Dashboard.
- Tests are not generated because the project doesn't run automated UI tests; the gate is `tsc --noEmit`, `next build`, and the manual quickstart walk-through (Constitution §"Pre-merge gates" 1, 2, 4).
- Commits should follow the pattern used in v0.5: small commits per leaf task, conventional commit prefixes (`feat`, `refactor`, `chore`), and a final summary commit closing the spec.
