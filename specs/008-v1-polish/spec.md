# Feature Specification: v1.0 Polish + v0.7 Final

**Feature Branch**: `008-v1-polish`

**Created**: 2026-05-14

**Status**: Draft

**Input**: User description: "Plan and ship a big v1.0 release: UI polish, more features (close the v0.7 backlog), cleaner UI across every remaining unpolished surface, a unified professional font. End-to-end, no checkpoints."

## Why this release

v0.6 made the workspace look like a product. v0.7 MVP made it operate like one (bulk + export + import). v1.0 closes the loop: every page the user can land on now uses the same visual language, the v0.7 backlog (inline edit, saved views, filter chips) ships, typography is unified, and the polish that was deferred — tooltips, empty/loading consistency, the lingering "old grid" feel on non-archetype tables — is done. This becomes the GA-ready release.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Every table feels like a real admin, archetype or not (Priority: P1)

A user opens a table that doesn't match any AI archetype (a join table, a config table). Today they land in the v0.5-era data grid with the old chrome and the row drawer. After v1.0 they see the same `PageHeader` chrome as Users / Content / Logs, with full-width row cards, a proper toolbar (Export + Import + Refresh), the BulkBar for multi-row ops, and clicking a row navigates to a dedicated detail page with a hero card, sectioned identity, and a linked-records sidebar — mirroring the archetype experience.

**Why this priority**: most Supabase projects have tables outside the four archetypes. Today the "Generic" path is the visible weak link. P1.

**Independent Test**: pick any table the analyzer classified as `generic` (or apply `?view=generic` to force it). Verify the list page uses `PageHeader`, rows are cards (not table rows), clicking a row goes to a redesigned detail page with hero + sections + sidebar matching `UserDetail`'s shape.

**Acceptance Scenarios**:

1. **Given** a generic-classified table with 50 rows, **When** I open it, **Then** the page uses `PageHeader` chrome (breadcrumbs, AI eyebrow, title, action toolbar) and rows are full-width cards.
2. **Given** the same table, **When** I click a row, **Then** I navigate to a detail page with a hero card surfacing the label column (PK or analysis.primary.titleColumn), sectioned identity fields, and a "Linked records" sidebar listing other tables that FK to this one.
3. **Given** the new generic detail page, **When** the table is a `VIEW`, **Then** Edit/Delete buttons are hidden but the layout is unchanged.
4. **Given** the new-row page (`/c/[id]/tables/[name]/new`), **When** I open it, **Then** it's wrapped in `PageHeader` with breadcrumbs back to the table.

---

### User Story 2 — Schema view feels like a product, not a code dump (Priority: P1)

A user clicks **Schema** in the sidebar. Today they see a flat list of tables → columns. After v1.0 they see the same archetype groupings as the Dashboard / Tables list, each table expandable to show its columns grouped by category (identifiers / fields / metadata), with FK relationships rendered as clickable chips and column types shown as inline tokens.

**Why this priority**: visible from every workspace page (sidebar item), used by anyone debugging their schema, currently the most v0.2-looking surface in the app. P1.

**Independent Test**: open `/c/[id]/schema`; verify PageHeader chrome, archetype groupings, expandable table rows, FK chips that link to the referenced table.

**Acceptance Scenarios**:

1. **Given** the schema page, **When** I look at it, **Then** the chrome matches every other workspace page (PageHeader with title, breadcrumbs, eyebrow showing column total).
2. **Given** the same page, **When** I look at the tables, **Then** they're grouped by archetype (People / Library / Activity / Everything else) matching the Tables list.
3. **Given** any table row in the schema view, **When** I expand it, **Then** I see its columns grouped (Identifiers / Fields / Metadata) with type tokens (text / int8 / uuid / etc.) and FK columns rendered as clickable chips that navigate to the referenced table.
4. **Given** system tables (`auth.*`, `storage.*`), **When** I look at the schema page, **Then** they're collapsed behind a "System tables" disclosure.

---

### User Story 3 — Power-user data ops complete (v0.7 final) (Priority: P1)

The remaining v0.7 backlog ships: filter chips (US6), saved views (US5), inline cell editing (US4) — finishing the "operate like a real admin" promise.

**Why this priority**: v0.7 left these on the table and they're already specced in `specs/007-power-data-ops/`. Without them the data-ops story has gaps that users see immediately. P1.

**Independent Test**: walk `specs/007-power-data-ops/quickstart.md` §4, §5, §6 — inline edit, saved views, filter chips — on the new generic grid as well as on archetype list views.

**Acceptance Scenarios**:

1. **Given** any list view, **When** I click a column header, **Then** a filter popover opens with operators appropriate to the column type, submitting adds a chip to the toolbar and updates the URL.
2. **Given** a built filter+sort combination, **When** I click "Save view", **Then** the named view appears as a tab in the PageHeader's tab slot and persists across reloads.
3. **Given** the new generic grid, **When** I single-click a non-readonly cell and press Enter, **Then** an in-place editor matching the column type appears; Enter commits, Escape reverts, success flashes accent-green.

---

### User Story 4 — Connection flows feel professional from the first deploy (Priority: P2)

A new user deploys Suparbase, signs in, lands on `/connections`, adds their first Supabase project. Today the connections list is a plain card list, the new-connection form is a flat form, and the per-connection settings page is an un-grouped heap of form rows. After v1.0 each surface is tightened: the list uses an archetype-aware card grid showing tables-detected counts, the new-connection form is narrower with helpful copy and a paste-from-Supabase-dashboard quick-fill, the settings page is grouped into Identity / Security / Danger sections.

**Why this priority**: first impression for every new user; today's "bare body" feeling sets a low bar that the workspace then has to overcome. P2.

**Independent Test**: walk through Sign up → Land on connections → New connection → Open connection → Connection settings. Every page uses `PageHeader` shell or the `AppHeader` account chrome consistently; no page reads as v0.2-era.

**Acceptance Scenarios**:

1. **Given** the connections list with 3 saved connections, **When** I look at the page, **Then** each card shows the friendly name + hostname + role chip + a small "X tables" stat (when introspectable cheaply) + last-used relative time.
2. **Given** the new-connection form, **When** I look at it, **Then** the form is wrapped in `PageHeader` with explanatory eyebrow + subtitle, has a "Paste from Supabase dashboard" hint, and labels are grouped logically.
3. **Given** the per-connection settings page, **When** I open it, **Then** it's organized into Identity (name) / Security (role display + key rotation hint) / Danger (delete) sections, each with their own surface card.

---

### User Story 5 — Typography is unified and professional (Priority: P2)

A user looks at any page. Today display text uses **Fraunces** (a serif) and body uses **Inter** (a sans). After v1.0 the entire app uses a single professional sans family — Inter Variable for body + a heavier-weight tighter-tracking variant for display — for a unified, modern, software-product feel. JetBrains Mono stays for code/data/IDs.

**Why this priority**: serif display on a database admin tool reads as decorative rather than professional. The unified sans is the standard look for serious product tools (Linear, Notion, Vercel). P2.

**Independent Test**: open any page; verify all `font-display` headings render in Inter (not Fraunces); verify body remains Inter; verify mono columns still use JetBrains Mono. Compare against current production to confirm the visual lift.

**Acceptance Scenarios**:

1. **Given** any page using `font-display`, **When** I inspect the rendered font, **Then** it resolves to "Inter Variable" (not Fraunces).
2. **Given** display headlines, **When** I look at them, **Then** they appear in a heavier weight with tighter tracking than body text, producing a clear typographic hierarchy.
3. **Given** the page weight/build, **When** I check the bundle, **Then** the Fraunces font is no longer loaded — fewer font requests at first paint.

---

### User Story 6 — Empty states, loading, tooltips, micro-polish (Priority: P3)

Across the app, every empty state uses a consistent `EmptyState` pattern; every async surface shows a skeleton (not blank); every icon-only button has a tooltip; success/error/in-flight states feel intentional (not utilitarian).

**Why this priority**: cumulative polish — small individually, big in aggregate. P3.

**Independent Test**: hover every icon-only button — tooltip appears. Force every empty state — explanatory copy + suggested action. Slow network — skeletons instead of blank.

**Acceptance Scenarios**:

1. **Given** any icon-only button (refresh, theme toggle, action menu trigger), **When** I hover it, **Then** a tooltip appears with the action name.
2. **Given** a fresh page load, **When** the data is still in flight, **Then** the surface shows a skeleton with the same shape as the loaded content (not a blank page).
3. **Given** an empty state, **When** I see it, **Then** the message explains *why* it's empty and offers the next action.

### Edge Cases

- A connection whose schema fails introspection. The Schema page renders an `ErrorBanner` with the failure category and a "Retry" action.
- A table with zero columns (should be impossible but defensively). The detail page renders an empty state with copy explaining the table is unusual.
- A user on a mobile-width viewport. Every new layout collapses gracefully; the BulkBar respects safe-area-bottom; the typography hierarchy holds.
- A connection in light mode. Every new component passes WCAG AA in both themes.
- A user with reduced motion. The inline-edit success-flash, BulkBar slide-in, hover transitions all degrade.

## Requirements *(mandatory)*

### Functional Requirements

**Generic admin (FR-G01–FR-G07)**

- **FR-G01**: `TableListView` MUST use `PageHeader` chrome matching the archetype presets.
- **FR-G02**: `TableListView` MUST render rows as full-width row cards (not HTML `<table>` rows).
- **FR-G03**: Clicking a row in `TableListView` MUST navigate to its detail page; no drawer.
- **FR-G04**: The generic detail page MUST render a hero card (label column at display size + identifying chips), sectioned identity fields respecting `analysis.hiddenColumns`, and a linked-records sidebar — mirroring `UserDetail`.
- **FR-G05**: The generic detail page MUST surface Edit and Delete actions in the same PageHeader pattern as the archetype detail pages.
- **FR-G06**: The new-row page MUST be wrapped in `PageHeader` with breadcrumbs back to the table list.
- **FR-G07**: Bulk operations (US1 from v0.7) MUST work on the generic grid, not just on archetype tables.

**Schema view (FR-S01–FR-S05)**

- **FR-S01**: `/c/[id]/schema` MUST use `PageHeader` chrome.
- **FR-S02**: Tables MUST be grouped by archetype using the same `groupTablesByArchetype` helper as the Dashboard / Tables list.
- **FR-S03**: Each table row MUST be expandable to reveal its columns, grouped into Identifiers / Fields / Metadata.
- **FR-S04**: FK columns MUST render as clickable chips that navigate to the referenced table.
- **FR-S05**: System tables MUST be collapsed under a disclosure.

**v0.7 final (FR-V07-1–FR-V07-3)**

- **FR-V07-1**: Filter chips per `specs/007-power-data-ops/spec.md` FR-F01–FR-F05 MUST be implemented on every list view.
- **FR-V07-2**: Saved views per `specs/007-power-data-ops/spec.md` FR-V01–FR-V07 MUST be implemented with the `saved_views` table (already migrated) and the `/api/views` routes.
- **FR-V07-3**: Inline cell editing per `specs/007-power-data-ops/spec.md` FR-E01–FR-E07 MUST be implemented in the new `TableListView` row cards.

**Connection flows (FR-C01–FR-C04)**

- **FR-C01**: `ConnectionList` MUST render each connection as a card showing name, hostname, role chip, an introspectable table count (when cached), and last-used relative time.
- **FR-C02**: The new-connection page MUST use `PageHeader` (under the AppHeader shell) with explanatory eyebrow + subtitle and field grouping that matches the rest of the app.
- **FR-C03**: The per-connection settings page MUST be organized into Identity / Security / Danger Zone sections, each within its own surface card.
- **FR-C04**: Every connection flow page MUST be reachable from the AppHeader shell with consistent breadcrumbs.

**Typography (FR-T01–FR-T04)**

- **FR-T01**: Display headings (`.font-display`) MUST resolve to Inter Variable with a heavier weight and tighter tracking — NOT Fraunces.
- **FR-T02**: Body text MUST continue to resolve to Inter Variable.
- **FR-T03**: Monospace columns / IDs MUST continue to resolve to JetBrains Mono Variable.
- **FR-T04**: The Fraunces font file MUST be removed from the bundle (no preload, no import).

**Polish (FR-P01–FR-P05)**

- **FR-P01**: Every icon-only button across the app MUST have an accessible tooltip on hover (Radix Tooltip + the existing `Tooltip` primitive).
- **FR-P02**: Every empty state MUST use the shared `EmptyState` component with a title, description, and (when applicable) a primary action.
- **FR-P03**: Every async surface (list pages, detail pages, schema view) MUST render a `<Skeleton>` with the same approximate shape as the loaded content.
- **FR-P04**: Every new interactive control MUST be keyboard-operable with visible focus per Constitution Principle IV.
- **FR-P05**: All new motion MUST respect `prefers-reduced-motion`.

### Key Entities *(include if feature involves data)*

- **SavedView** (existing from v0.7 MVP migration). The repo at `src/server/views/repo.ts` is in place; this release ships the `/api/views` routes + the client UI.
- All other entities unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero pages in the authenticated workspace render the v0.5-era chrome — every list / detail / form page uses `PageHeader`.
- **SC-002**: The largest authenticated first-paint JS bundle stays ≤ 520 KB gzipped per Constitution Principle I.
- **SC-003**: Removing Fraunces reduces the first-paint font payload (one fewer woff2 family loaded on the unauthenticated landing page and on every authenticated workspace page).
- **SC-004**: A user can apply a filter, save it as a view, and re-apply it from a different browser session in fewer than 10 actions total (build filter, save, sign out, sign in, click tab, see results).
- **SC-005**: 100% of icon-only buttons introduced in v0.6 / v0.7 / v1.0 have accessible tooltips.
- **SC-006**: All new interactive UI passes keyboard-only operation on a smoke walkthrough.
- **SC-007**: `pnpm typecheck` and `pnpm build` pass; CI green on the PR.
- **SC-008**: No new dependencies are added.

## Assumptions

- v0.7 MVP infrastructure (saved_views table, bulk endpoints, ChipSpec types, CSV lib, BulkBar / ExportMenu / ImportPanel) is in place on `main`. v1.0 builds on top.
- The Fraunces removal is acceptable; the project's "anti-AI-slop" principle is preserved through deliberate use of Inter + accent + layout, not via the serif specifically.
- `RowPresetRouter` already dispatches `users` / `content` / `logs` archetypes. v1.0 adds a `generic` branch that renders the new generic detail component.
- `groupTablesByArchetype` is reused everywhere tables are grouped (Dashboard, Tables list, Schema view).
- No new database tables. `saved_views` was already migrated in v0.7 MVP.
- The constitution gets a v3.3.0 amendment noting the v1.0 release shift; no NON-NEGOTIABLE is relaxed.
