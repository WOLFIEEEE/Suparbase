# Quickstart: verifying the v0.6 release

This is the manual smoke path that maps to spec acceptance criteria. Run it after `pnpm typecheck && pnpm build` on the `006-product-workspace` branch.

## Prerequisites

1. A clean Suparbase deploy from this branch with at least one Suparbase user account.
2. A connected Supabase project that has, at minimum:
   - one users-classified table (e.g. `users` or `profiles`),
   - one content-classified table (e.g. `posts`, `articles`, `docs`),
   - one logs-classified table (e.g. `events`, `audit_log`),
   - at least one non-classified "Other" table,
   - at least one row already edited via Suparbase so the `audit_log` has entries.
3. Optional: an OpenRouter key configured in `/settings/ai` and a cached AI analysis for the connection (to exercise the AI-enhanced code paths). If absent, the heuristic fallback paths are exercised instead: both must pass.

## 1. Dashboard: User Story 1

- [ ] Visit `/c/{id}`.
- [ ] The page header title is the connection's **friendly name**, not the hostname. The hostname appears underneath in muted type.
- [ ] A stat strip with at least four tiles is visible at the top: "Audience" / "Library" / "Activity (7d)" / "Other tables" (labels may vary slightly with archetypes detected; SC-001).
- [ ] Tables are grouped under named sections (People / Library / Activity / Everything else). Each section's heading shows a count.
- [ ] A "Recent activity" panel renders the latest audit entries with verb, table, time-ago, and a clickable row link.
- [ ] If you wipe `audit_log` for this connection, the panel renders an empty state with explanatory copy, not an error.
- [ ] At least 3 quick-action buttons are visible: "Open settings" and an "Invite user" (when a users table exists). AI actions appear only with an OpenRouter key.
- [ ] No literal phrase "12 tables · 3 views" appears as a primary metric (it MAY appear in the sidebar or "Other tables" tile).

## 2. Tables list: User Story 2

- [ ] Visit `/c/{id}/tables`.
- [ ] The page uses `PageHeader` chrome (breadcrumb → eyebrow → title → actions) identical to the Users archetype page.
- [ ] Tables are grouped by archetype with named sections. Empty archetype groups are not rendered (SC-001 supporting).
- [ ] Tables in `auth` or `storage` schemas are *not* in the main groups. A "System tables (N)" disclosure at the bottom expands to reveal them.
- [ ] Typing in the search filters every section in place; sections with zero matches hide their heading entirely.

## 3. Content archetype: User Story 3

- [ ] Visit a content-classified table.
- [ ] The page header matches Users-archetype chrome.
- [ ] Stat tiles include total items, draft/published split (if a status column exists), and a "newest first" hint.
- [ ] Rows render as full-width cards: title prominent, status pill aligned right, author + published-at as subtitle, hover-revealed action menu.
- [ ] Clicking a row navigates to `/c/{id}/tables/{name}/{pk}`: no drawer overlay.
- [ ] The detail page renders a hero block with the title at display size, a metadata row, the body as readable wrapped text (not monospace), and a Linked-records sidebar listing other tables that FK into this one.

## 4. Logs archetype: User Story 4

- [ ] Visit a logs-classified table with at least 20 rows spanning multiple days.
- [ ] Rows are grouped under day-bucket headers (Today / Yesterday / This week / Earlier).
- [ ] An `event_type` or `action` column renders as a status-style chip.
- [ ] A jsonb payload column collapses to a one-line preview by default; clicking expands inline.
- [ ] If you visit a logs table that has no timestamp column, a single banner explains "no timestamp column found: events are not time-ordered" and the page falls back to a flat, ungrouped list.
- [ ] Clicking a row goes to the detail page; the detail uses the same chrome with timestamp prominent, payload pretty-printed, and the actor relation surfaced as a card.

## 5. Command palette: User Story 5

- [ ] On any `/c/{id}/*` page, press **Cmd+K** (macOS) or **Ctrl+K** (Windows / Linux).
- [ ] A dialog opens with the search input focused.
- [ ] Results are grouped under labelled headings: "Tables", "Connections", "Settings", "Actions".
- [ ] Typing a partial table name filters; arrow keys navigate; Enter navigates to the selected destination; Escape closes the palette without navigating.
- [ ] Open the palette on a fresh page load: the dialog appears immediately even before all results have streamed in; a skeleton row is shown while data resolves.

## 6. Theme toggle: User Story 6

- [ ] Find the theme toggle in the Topbar.
- [ ] Click it: the workspace flips between light and dark; the icon updates.
- [ ] Reload the page after switching: no flash of the previous theme. Initial paint matches the chosen theme.
- [ ] In DevTools → Application → Cookies, verify a `suparbase-theme` cookie with `SameSite=Lax`, value `"light"` or `"dark"`.
- [ ] Focus the toggle with Tab: it has a visible focus ring and `aria-pressed` reflects the current state. A screen reader announces "Switch to light" or "Switch to dark".
- [ ] Clear the cookie and reload: the theme defaults to your OS's `prefers-color-scheme`.

## 7. Sidebar: User Story 7

- [ ] Sidebar "Tables" item shows a numeric badge of the table count; "Schema" shows column count (or is omitted if not feasible).
- [ ] When you're on a section, that sidebar item has accent-tinted background and a visible left-edge indicator distinguishable in both themes.
- [ ] The "AI assistance" footer link shows `{model} · {tokens} tok` as a muted subtitle when an analysis is cached; "not run yet" or omitted otherwise.

## 8. Constitution gates

- [ ] `pnpm typecheck` passes with no errors.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm build` output shows the largest first-paint authenticated JS bundle ≤ 520 KB gzipped (Constitution Principle I).
- [ ] Every interactive element introduced (palette, toggle, archetype disclosure, system-tables disclosure) is reachable with keyboard alone and has a visible focus ring.
- [ ] In OS settings, enable Reduced Motion. Reload: no animated flourishes appear on the Dashboard hero.
- [ ] No `console.log` / `console.error` / `console.warn` calls remain in shipped code paths (`rg -n "^\s*console\.(log|warn|error)" src/`).

## 9. Regression check

- [ ] Pre-existing flows still work end-to-end: sign up, sign in, create connection, browse the Users archetype, edit a user, delete with undo, sign out.
- [ ] `?view=generic` per-table override still falls back to the generic data grid.
- [ ] The proxy and audit log continue to record writes correctly.

When every checkbox passes, v0.6 is ready to merge.
