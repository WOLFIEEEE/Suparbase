# Feature Specification: Product Workspace

**Feature Branch**: `006-product-workspace`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "Make Suparbase look like a real product, not a database admin tool. A coherent visual + UX overhaul of every workspace surface that isn't already an opinionated archetype (Users was rebuilt last week). Includes a redesigned Dashboard, a redesigned Tables list, rebuilds of the Content and Logs presets, a global command palette, a light/dark theme toggle, and matching sidebar polish."

## User Scenarios & Testing *(mandatory)*

### User Story 1: Land on a Dashboard that explains the project, not the schema (Priority: P1)

A user signs into Suparbase and opens one of their saved connections. Instead of a flat grid of "12 tables, 3 views" they land on a Dashboard that tells them what this project IS: how many people are in their audience, how much content they have, how much activity has happened recently, and 3–4 things they can do right now.

**Why this priority**: this is the single most-seen page in the product. If it looks like a database admin, the rest of the work doesn't register. P1.

**Independent Test**: open `/c/{id}` on a connection that has at least one users-classified table and one logs-classified table; verify the page header reads the connection's friendly name, the stat strip shows archetype-derived counts (not raw row totals), tables are grouped by archetype with their AI display names, and a recent-activity panel is visible (populated from the audit log, or an empty state with copy when there are no entries).

**Acceptance Scenarios**:

1. **Given** I have a connection with users, posts, and an audit-log-style events table, **When** I open the connection home, **Then** the page header shows the connection's friendly name (not the hostname) as the title, the hostname appears as a muted subtitle, and a single accent dot indicates connection health.
2. **Given** the same connection, **When** I scan the page, **Then** I see a stat strip with: total people in the users-classified table, total items in the content-classified table, total events in the last 7 days from the logs-classified table, and a count of all other tables: each tile labeled in plain English (e.g. "Audience", "Library", "Activity (7d)", "Other tables").
3. **Given** I have audit-log entries for this connection, **When** I scroll the Dashboard, **Then** a "Recent activity" panel shows up to 10 entries with verb, table, time-ago, and a link to the affected row.
4. **Given** I have no audit-log entries yet, **When** I scroll the Dashboard, **Then** the panel renders an empty state with copy explaining audit logging will populate once I edit rows.
5. **Given** the Dashboard, **When** I look at the actions area, **Then** I see 3–4 quick-action buttons: at least "Invite user" (linking to the users-classified table's new-row route when one exists) and "Open settings"; AI-related actions appear only when an OpenRouter key is configured.

---

### User Story 2: Browse tables grouped by what they're for, not alphabetically (Priority: P1)

A user clicks the "Tables" sidebar item. Instead of an alphabetical grid of tiles, they see their tables grouped by archetype with friendly section titles, internal/system tables hidden behind a disclosure, and a search that filters across all groups.

**Why this priority**: the Tables list is the second-most-seen page. P1.

**Independent Test**: open `/c/{id}/tables` on a connection that has tables in at least two archetypes; verify the groups render with their friendly titles ("People", "Content", "Activity", "Everything else"), `auth.*` / `storage.*` tables are collapsed under a "System tables" disclosure, and typing in the search filters every group simultaneously.

**Acceptance Scenarios**:

1. **Given** a connection with users + content + events + four other tables, **When** I open the tables page, **Then** I see at least three named sections (People, Content, Activity) plus an "Everything else" section, each with a row count.
2. **Given** the same connection, **When** I type a partial table name into the search field, **Then** every section filters in place; sections that become empty hide their header.
3. **Given** a connection that includes `auth.users` and `storage.objects`, **When** I open the tables page, **Then** those tables do not appear in the main groups; a "System tables (2)" disclosure at the bottom of the page expands to show them.
4. **Given** the tables page, **When** I look at the page header, **Then** it uses the same chrome as the Users archetype (breadcrumb → eyebrow → title → actions); the page no longer feels visually different from a preset page.

---

### User Story 3: Content tables feel like a CMS, not a styled grid (Priority: P1)

A user opens a content-classified table (posts, articles, docs). They see a CMS-style list: title prominent, status pill, author, published-at: and clicking a row opens a real article detail page with a title hero, the body rendered, and a relations sidebar. The drawer is gone.

**Why this priority**: content is one of the two most-common archetypes (the other being users). Without this, the visual coherence claim isn't true. P1.

**Independent Test**: open a content-classified table; verify the list view uses the new chrome (PageHeader with breadcrumb, stat tiles, opinionated row cards), each row navigates to a dedicated detail page (not a drawer), and the detail page shows a title hero, body, and a relations sidebar mirroring the Users archetype layout.

**Acceptance Scenarios**:

1. **Given** a content-classified table, **When** I open it, **Then** the page header matches the Users archetype (breadcrumb, eyebrow AI badge, title, primary action) and a stat strip shows total items, items in draft vs. published (when a status column exists), and a "newest first" hint.
2. **Given** the same table, **When** I scan the list, **Then** rows are full-width cards with title prominent, status pill aligned right, optional author and published-at as subtitle, and a hover-revealed action menu.
3. **Given** the same table, **When** I click a row, **Then** I navigate to the row detail page (no side drawer); the URL changes to `/c/{id}/tables/{name}/{pk}`.
4. **Given** that detail page, **When** it loads, **Then** I see a hero block with the title at display size, status + author + published-at as a subtitle row, the body rendered as readable text (markdown-ish line wrapping, no monospace dump), and a right-rail showing "Linked records" pulled from incoming FKs.

---

### User Story 4: Log tables feel like an activity stream, not a grid (Priority: P2)

A user opens a logs-classified table (events, audit, webhooks). They see a time-bucketed event stream: "Today / Yesterday / Earlier this week": with each event rendered as a row card showing verb, actor, and a payload preview.

**Why this priority**: logs are the third most-common archetype. Visually crucial because logs in a raw grid are the *worst*: long jsonb payloads make the page unreadable. P2.

**Independent Test**: open a logs-classified table that has at least 20 rows spanning multiple days; verify rows are grouped by day with a sticky day header, jsonb payloads are collapsed to a one-line summary by default with a click-to-expand, and the page header matches the Users archetype.

**Acceptance Scenarios**:

1. **Given** a logs-classified table with rows in the last 24 hours and rows from previous days, **When** I open it, **Then** rows are grouped under day headers (Today, Yesterday, This week, Earlier).
2. **Given** the same table, **When** an event row has a jsonb payload column, **Then** the payload is collapsed to a single-line preview by default; clicking it expands it inline.
3. **Given** the same table, **When** an event has an `event_type` or `action` column, **Then** that value renders as a status-pill-style chip.
4. **Given** the same table, **When** I open a row's detail page, **Then** the detail uses the same layout language as content/users but tailored to events (timestamp prominent, payload pretty-printed, related actor relation rendered as a card).

---

### User Story 5: Jump to anything with the keyboard (Priority: P2)

A user presses Cmd/Ctrl+K from anywhere in the workspace. A command palette opens showing a search field and a list of jumpable destinations: their other connections, tables (with AI display names), a few global actions, and settings pages. Typing filters the list; Enter navigates.

**Why this priority**: huge perceived-polish gain, low cost (cmdk is already in the bundle). Productivity feature for repeat users. P2.

**Independent Test**: from any `/c/{id}/*` route, press Cmd/Ctrl+K; the palette opens; typing a partial table name filters to it; Enter navigates; Esc closes; the palette is fully keyboard-driven and announces itself to screen readers.

**Acceptance Scenarios**:

1. **Given** I am anywhere inside the workspace, **When** I press Cmd+K (macOS) or Ctrl+K (other), **Then** a dialog opens with a search field focused.
2. **Given** the palette is open, **When** I type a partial match, **Then** results are grouped under labeled headings ("Tables", "Connections", "Settings", "Actions") and the first result is highlighted.
3. **Given** I have arrow-keyed to a result, **When** I press Enter, **Then** I navigate to the destination and the palette closes.
4. **Given** the palette, **When** I press Escape, **Then** it closes without navigating.
5. **Given** I have not yet opened the palette in this page load, **When** I open it for the first time, **Then** the index of tables and recent rows is populated lazily (the palette opens immediately and shows a skeleton until the data arrives).

---

### User Story 6: Choose dark or light without a flash on next visit (Priority: P3)

A user clicks a theme toggle in the Topbar. The workspace switches between dark and light. On the next page load: and on any subsequent visit: the chosen theme is applied during initial paint, not after hydration.

**Why this priority**: visible polish, but smaller audience impact than the structural redesigns. P3.

**Independent Test**: toggle the theme, navigate to a different route, reload: verify no flash of the previous theme; verify the toggle is keyboard-operable and announces its pressed state.

**Acceptance Scenarios**:

1. **Given** I'm in dark mode, **When** I click the theme toggle, **Then** the workspace switches to light mode and the toggle's icon/label updates.
2. **Given** I have switched to light, **When** I reload the page, **Then** the page paints in light immediately: no dark flash, no theme flicker.
3. **Given** the theme toggle, **When** I focus it with the keyboard, **Then** it has a visible focus ring and announces its current state ("dark, toggle to light" or equivalent) to a screen reader.
4. **Given** I have not chosen a theme, **When** I first visit the workspace, **Then** the theme defaults to the system preference (prefers-color-scheme).

---

### User Story 7: Sidebar reflects what the AI has learned (Priority: P3)

A user looks at the sidebar. The static "Tables" / "Schema" / "Settings" items remain, but the workspace nav now shows small inline counts and the active item is accent-tinted. The "AI assistance" footer link grows a tiny subtitle showing model + last token usage when an analysis exists.

**Why this priority**: smallest scope of the seven. Pulls the visual language together but is not load-bearing. P3.

**Independent Test**: visit the workspace; verify each sidebar item shows a count next to it when applicable, the active item has accent treatment, and the AI footer shows usage data when an analysis is cached.

**Acceptance Scenarios**:

1. **Given** the workspace, **When** I look at the sidebar, **Then** "Tables" shows the total tables count and "Schema" shows the total columns count.
2. **Given** I'm on the tables page, **When** I look at the sidebar, **Then** the "Tables" item has an accent-tinted background and a subtle left-edge indicator.
3. **Given** I have run an AI analysis, **When** I look at the AI footer link, **Then** it shows the last-used model and the last token total as a muted subtitle.
4. **Given** I have not run an AI analysis, **When** I look at the AI footer link, **Then** the subtitle reads "not run yet" or is omitted.

---

### Edge Cases

- A connection has zero tables. The Dashboard renders an explicit empty state with copy guiding the user to add tables in Supabase.
- A connection has only one archetype represented. The Dashboard and tables-list pages omit the unused group headers entirely rather than rendering empty sections.
- A user reaches the Dashboard before the AI analysis has run. The archetype-driven copy falls back to the heuristic classification; no AI-only copy is shown.
- A user opens the command palette before the table index has fetched. The palette opens immediately with a skeleton row and resolves to results as the data arrives; pressing Enter on an unresolved entry is disabled.
- A user is on a slow connection. The Dashboard stat strip skeleton-loads each tile independently; no tile blocks the page.
- A user disables JavaScript. The workspace is server-rendered enough to show the sidebar, topbar, and the current page's headline; interactive features (palette, theme toggle) are unavailable but the rest renders.
- A user has `prefers-reduced-motion` set. Any landing-style flourish on the Dashboard hero is suppressed; only structural state-change transitions remain.
- A user resizes the window narrow. The Dashboard reflows to a single column; the command palette remains usable; the sidebar collapses behind the existing mobile-nav dialog.
- A user clicks the theme toggle on a page that is already loading. The toggle persists immediately; the in-flight request completes against the new theme without re-paint thrash.

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard (FR-D01–FR-D10)**

- **FR-D01**: The Dashboard MUST show the connection's friendly name (not the hostname) as the page title, with the hostname as a muted subtitle.
- **FR-D02**: The Dashboard MUST render a hero stat strip with at least four tiles: one labelled in plain English per detected archetype (people / library / activity), and one for "other tables" or similar. Tiles missing an archetype (e.g. no logs table) MUST gracefully degrade.
- **FR-D03**: The Dashboard MUST group tables under archetype-labeled sections using the AI-derived display name (or heuristic fallback) for each table.
- **FR-D04**: The Dashboard MUST surface up to 10 most-recent audit-log entries for the active connection, scoped to the current user, with verb + table + time-ago, and a deep link to the affected row when the primary key is retained.
- **FR-D05**: The Dashboard MUST render an empty-state with explanatory copy when there are no audit-log entries yet.
- **FR-D06**: The Dashboard MUST show 3–4 quick-action buttons. The set MUST include "Open settings" and, when applicable, "Invite user" (a deep link to the users-classified table's new-row route). AI-related actions MUST appear only when the user has an OpenRouter key configured.
- **FR-D07**: The Dashboard MUST not display the literal phrases "N tables / N views" as its primary metric; raw counts may appear only in a secondary "Other tables" tile or in the sidebar.
- **FR-D08**: The Dashboard MUST use the same `PageHeader` chrome (breadcrumb, eyebrow, title, actions) as the Users archetype.
- **FR-D09**: The Dashboard MUST honour `prefers-reduced-motion` for any landing-style flourish and MUST contain no decorative motion in the data sections.
- **FR-D10**: The Dashboard MUST tolerate a connection with zero tables, rendering an explicit guidance empty state.

**Tables list (FR-T01–FR-T05)**

- **FR-T01**: The Tables list page MUST group tables by archetype with named sections, including an "Everything else" catch-all.
- **FR-T02**: The Tables list MUST hide tables whose `schema` is `auth` or `storage` behind a single "System tables" disclosure that is closed by default. (A per-table "internal" flag is out of scope for v0.6; schema-name filtering is the only mechanism.)
- **FR-T03**: The Tables list MUST provide a search input that filters every section simultaneously; sections that filter to zero results MUST hide their header.
- **FR-T04**: The Tables list MUST use the same `PageHeader` chrome as every other workspace page.
- **FR-T05**: The Tables list MUST tolerate a connection in which one or more archetypes are absent (no users tables, no logs tables, etc.) by omitting those section headers entirely.

**Content archetype (FR-C01–FR-C05)**

- **FR-C01**: The Content list view MUST use `PageHeader` with breadcrumb, AI eyebrow, title, and a primary action ("New post" or analogous) when the table is writeable.
- **FR-C02**: The Content list MUST render rows as full-width opinionated cards with the title prominent, the status pill aligned to the right, and a subtitle row containing (when present) author label and published-at.
- **FR-C03**: Clicking a content row MUST navigate to a dedicated row detail page; no drawer-based detail is permitted for this archetype.
- **FR-C04**: The Content row detail page MUST render a title hero (display-size typography), a metadata row (status / author / published-at / updated-at), the body column as readable text with line wrapping (markdown-aware preview when feasible), and a "Linked records" sidebar driven by incoming FKs.
- **FR-C05**: The Content archetype MUST respect `analysis.primary`, `analysis.hiddenColumns`, and `analysis.relations` exactly as the Users archetype does.

**Logs archetype (FR-L01–FR-L05)**

- **FR-L01**: The Logs list view MUST render rows as a time-grouped event stream with day-bucket headers (Today / Yesterday / This week / Earlier).
- **FR-L02**: Each event row MUST render the event-type or action column as a chip, the actor (when an actor relation exists) as a labeled link, and the timestamp as a relative time with absolute on hover.
- **FR-L03**: jsonb payload columns MUST be collapsed to a single-line preview by default, expandable inline on click.
- **FR-L04**: The Logs list view MUST use `PageHeader` and stat tiles consistent with Users and Content.
- **FR-L05**: The Logs row detail page MUST render the event timestamp prominently, pretty-print the payload, and surface any actor or subject FK relation as an inline card.

**Command palette (FR-P01–FR-P05)**

- **FR-P01**: A command palette MUST open from anywhere in the workspace via Cmd+K (macOS) or Ctrl+K (other platforms).
- **FR-P02**: The palette MUST index, at minimum: the user's connections, the active connection's tables (with AI display names), the global settings pages, and a small action set ("Open settings", "Run AI analysis" when applicable, "Sign out", "Toggle theme").
- **FR-P03**: The palette MUST display results in labelled groups and MUST be fully keyboard-operable (arrow keys, Enter to select, Escape to close); the focus trap MUST be correct.
- **FR-P04**: The palette MUST lazy-load its index: opening the palette MUST NOT block on data fetches; results MUST stream in.
- **FR-P05**: The palette MUST close on selection and navigate the page via client-side routing.

**Theme (FR-TH01–FR-TH04)**

- **FR-TH01**: A theme toggle MUST be present in the Topbar showing the current theme and offering to switch to the other.
- **FR-TH02**: The chosen theme MUST persist across reloads via an HTTP cookie readable on the server, so the initial paint of the next page load matches the chosen theme.
- **FR-TH03**: When the user has never chosen a theme, the workspace MUST default to the system `prefers-color-scheme`.
- **FR-TH04**: The theme toggle MUST be keyboard-operable and MUST announce its state via `aria-pressed` or equivalent.

**Sidebar polish (FR-S01–FR-S03)**

- **FR-S01**: The sidebar's Tables item MUST show the count of tables; Schema MUST show the count of columns (or be omitted if not feasible).
- **FR-S02**: The currently active sidebar item MUST have an accent-tinted background and a left-edge indicator distinguishable for users with color-vision deficiencies.
- **FR-S03**: The AI assistance footer link MUST show last-used model and last token total as a muted subtitle when an analysis is cached; otherwise show "not run yet" or omit the subtitle.

### Key Entities *(include if feature involves data)*

- **Connection**: an authenticated user's saved Supabase project. Already exists in the schema; this feature reads `connection.name`, `connection.hostname`, and creation metadata to render the Dashboard header.
- **Table & Analysis**: the introspected schema and the cached `TableAnalysis` (category, display name, primary identity, hidden columns, relations) together drive every archetype-aware surface in this release.
- **Audit log entry**: existing `audit_log` rows are read by the Dashboard's recent-activity panel. No schema changes are required.
- **User setting: theme**: a per-user preference (light / dark / system) persisted as a signed cookie. Not stored in the database for v1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor opening a populated connection identifies, within 5 seconds and without scrolling, the dominant archetypes of that database (e.g. "this project has users and content"), because each archetype is named in plain English in the Dashboard hero.
- **SC-002**: Across the seven workspace surfaces (Dashboard, Tables list, Users list/detail, Content list/detail, Logs list/detail), zero pages render the "rows-in-a-flat-grid + drawer-as-detail" pattern.
- **SC-003**: From any workspace route, a keyboard-only user can open the command palette (Cmd+K / Ctrl+K), type 1–3 characters to disambiguate a table, and press Enter to navigate to that table: without touching the mouse.
- **SC-004**: When the user reloads after switching themes, the time between first paint and a re-paint due to theme correction is zero (i.e. no flash is observable).
- **SC-005**: The total JS payload at first paint of any authenticated route remains within the Constitution Principle I budget (≤ 520 KB gzipped), measured against a production build.
- **SC-006**: 100% of interactive elements introduced in this release (command palette, theme toggle, archetype section disclosures, system-tables disclosure) pass keyboard-only operation and visible-focus checks.
- **SC-007**: An analysis is correctly degraded: for a connection with no cached AI analysis, the Dashboard, Tables list, and presets still render using the heuristic fallback alone, with zero user-facing errors.
- **SC-008**: The "drawer as detail" pattern is removed from the Content and Logs archetypes; every row now navigates to a dedicated URL that is shareable and bookmarkable.

## Assumptions

- The AI-driven `TableAnalysis` shape (`category`, `displayName`, `primary`, `hiddenColumns`, `relations`) already shipped in the v0.5.1 work is available everywhere this spec depends on it. The heuristic fallback covers offline mode.
- The existing audit log is sufficient for "recent activity": it captures verb, table, primary key, user, and timestamp. No new columns are required.
- The `cmdk` library and Radix Dialog are already in the bundle (per the constitution's permitted-additions list); no new dependencies are introduced.
- CSS variables already define both light and dark themes; the toggle is a class swap on the root, not a Tailwind theme regeneration.
- No new archetypes (commerce, inventory, messages, tasks) are introduced in this release. The AI prompt's category enum stays at `users | content | logs | generic`. New archetypes are planned for a later release and are tracked in the analysis taxonomy doc.
- All previously deferred items (bulk actions, CSV import/export, inline editing, SQL editor, auth.users dedicated admin, RLS viewer, storage browser, email verification, password reset, audit log UI, multi-tenant connection sharing, realtime row updates) remain out of scope for this release and are sequenced into v0.7+.
- The performance and accessibility budgets in the Constitution (Principles I and IV) are treated as gating constraints; any visual flourish that compromises them is dropped from the release without further review.
