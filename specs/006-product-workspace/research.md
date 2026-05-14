# Phase 0: Research

**Feature**: Product Workspace (v0.6) · [spec.md](./spec.md) · [plan.md](./plan.md)

No NEEDS CLARIFICATION markers carried over from the spec. The decisions below document trade-offs that surfaced while designing the implementation, so future contributors can follow why each surface is shaped the way it is.

## Decision 1: Friendly archetype labels instead of category names

**Decision**: User-facing copy on the Dashboard and Tables list uses friendly archetype labels (**People**, **Library**, **Activity**, **Everything else**) instead of the internal category names (`users`, `content`, `logs`, `generic`).

**Rationale**: The spec's core success criterion (SC-001) is that a first-time visitor identifies the dominant archetypes "in plain English". "Users" / "Content" / "Logs" read as database concepts; "People" / "Library" / "Activity" read as product concepts. The internal category enum stays as-is: only display strings change.

**Alternatives considered**:
- Keep "Users / Content / Logs" headings everywhere. Rejected: contradicts the product-not-database goal stated by the user.
- Allow the AI to invent per-connection group labels ("Subscribers" for `subscribers`, "Drafts" for `posts`). Rejected for v0.6: too much variance in output quality without per-connection user editing, which is itself out of scope. Park for v0.7+.

## Decision 2: Dashboard tiles read from the "best" archetype table, not a sum

**Decision**: When a connection has multiple users-classified tables (e.g. `users` *and* `auth.users`), the "People" tile reads row count from the *largest non-internal* one. Same rule for Library (Content) and Activity (Logs). When no table of an archetype exists, the tile is omitted entirely.

**Rationale**: Summing across multiple `users` tables produces a number that's hard to reason about (auth.users typically duplicates public.users). Picking the single dominant table makes the tile click-through unambiguous: clicking "Audience" deep-links to that table. Omitting absent archetypes is consistent with the spec edge case "only one archetype represented".

**Alternatives considered**:
- Always sum. Rejected: see above.
- Always link to the Tables-list filter for that archetype. Rejected: an extra click for the most common case (one table per archetype).

## Decision 3: Reuse the existing `audit_log` table for "Recent activity"

**Decision**: The Dashboard's recent-activity panel reads from the existing `audit_log` rows for the active connection scoped to the current user. No new schema, no new write path.

**Rationale**: The audit table already records `(userId, connectionId, table, verb, primaryKey, timestamp)` for every write done through the proxy (per Constitution Principle VIII). That's the exact shape the recent-activity panel needs. Introducing a new "activity feed" table would be redundant and violate "no abstraction without a second concrete caller".

**Alternatives considered**:
- Add a denormalised feed table with rendered strings. Rejected: redundant data, drift risk, no second caller until a future activity-stream feature.
- Fetch from the Supabase project itself (the logs-classified table). Rejected: only available when the user actually has such a table; reading from `audit_log` works on day one.

## Decision 4: Command palette index is built lazily on first open

**Decision**: The CommandPalette component mounts unindexed. The first time the user opens it (Cmd+K or click), it kicks off the data fetches it needs (`useConnections`, `useSchema` for the active connection); those queries are likely already warm in the react-query cache from the workspace layout, but if they aren't, results stream in and the search input is usable immediately against whatever has resolved.

**Rationale**: Constitution Principle I caps authenticated TTI at 2.5s and JS budget at 520 KB gz. Forcing the palette to populate at mount means every route pre-fetches the index even if the user never opens the palette. Lazy is strictly better here because the relevant queries are already in flight (sidebar already mounts `useSchema`, layout already has the connection list cached).

**Alternatives considered**:
- Server-side index in a Server Component. Rejected: react-query state isn't trivially mirrorable into RSC without duplicating fetches; not worth the complexity for an interactive client widget.
- Pre-warm index at workspace layout mount. Rejected: same as above, just moved earlier in time.

## Decision 5: Theme stored in an HTTP cookie, read on the server in the root layout

**Decision**: The user's theme preference (`"light" | "dark" | "system"`) is persisted in a cookie named `suparbase-theme`. The root `app/layout.tsx` reads it via `cookies()` from `next/headers` and sets `data-theme="light"` / `data-theme="dark"` on `<html>` during SSR. The client-side toggle writes the cookie and updates the attribute optimistically.

**Rationale**: `localStorage` is unreadable on the server, which means SSR can't pick the right theme: guaranteed flash. A cookie is readable on the server, fixing the flash without any client hydration race. The cookie is non-sensitive (preference only) so it's `SameSite=Lax` without `Secure`-only enforcement.

**Alternatives considered**:
- Use `prefers-color-scheme` and skip the toggle. Rejected: spec User Story 6 explicitly requires a manual toggle.
- Store the theme in the `user_settings` Drizzle table. Rejected: requires a DB round-trip on every SSR request just for a UI preference; over-engineered.

## Decision 6: System tables disclosure uses native `<details>`

**Decision**: The Tables list's "System tables" group at the bottom of the page is rendered as a native `<details>` element with a styled `<summary>`. Same goes for the "hidden internal fields" disclosure inside `UserDetail` (which already shipped this way).

**Rationale**: Native `<details>` is semantic, keyboard-accessible, screen-reader-correct, and SSR-friendly with zero JS. Replacing it with a custom Radix Disclosure would be regression: more code, same outcome.

**Alternatives considered**:
- Radix Collapsible. Rejected: needs JS to render the closed state, costs SSR fidelity, no clear win.

## Decision 7: Day-bucketing for Logs handles missing timestamps gracefully

**Decision**: `LogsAdmin` groups rows by `timestampColumn` (from `analysis.primary` heuristic or `analysis.timestampColumn`, with `created_at` as the broad fallback). When *no* timestamp column exists on a logs-classified table, the page renders a single ungrouped stream with a one-line banner: "no timestamp column found: events are not time-ordered." It does not fall back to the generic grid.

**Rationale**: Logs without timestamps are unusual but not impossible (e.g. ordered only by serial PK). Falling back to the generic grid would defeat the purpose of the archetype rebuild. The banner makes the limitation explicit.

**Alternatives considered**:
- Hide the bucket headers but keep an ordered list. Rejected: that's effectively what the banner case does; the banner is the addition.
- Refuse to render the preset and force `?view=generic`. Rejected: surprising and worse than the banner.

## Decision 8: ContentDetail renders the body as preformatted text with line wrapping, not Markdown HTML

**Decision**: The `bodyColumn` on `ContentDetail` is rendered in a `<div>` styled with `white-space: pre-wrap; word-break: break-word; font-family: inherit;`: not Markdown-to-HTML.

**Rationale**: We don't yet know if a given content table stores Markdown, HTML, plain text, or rich-text JSON. Rendering as preformatted text is correct for all of them, and it looks dramatically better than `<pre>{json}</pre>` or a monospace dump. Adding a real Markdown renderer would mean introducing `react-markdown` (new dependency, forbidden without justification per Technology Standards) for marginal gain on day one. We can add per-table format detection (and possibly a Markdown renderer behind a justified dependency add) in a follow-up release.

**Alternatives considered**:
- Render as Markdown via `react-markdown`. Rejected: new dependency, plus wrong for plain-text and HTML bodies.
- Render as `<pre>{raw}</pre>`. Rejected: monospace, no wrapping, looks like the database admin we're trying to leave behind.

## Decision 9: ContentAdmin and LogsAdmin lose their drawers entirely; v2 always navigates to the detail page

**Decision**: Both archetypes drop the `RowDrawer` overlay. Clicking a row always navigates to `/c/{id}/tables/{name}/{pk}` and is dispatched by the existing `RowPresetRouter` to the matching detail component.

**Rationale**: Spec SC-008 explicitly removes the drawer pattern from Content and Logs. Detail URLs are shareable, bookmarkable, and the row archetype now produces a layout rich enough to deserve a real page.

**Alternatives considered**:
- Keep the drawer for "quick preview". Rejected: doubles the layout surface and contradicts the spec.

## Decision 10: Sidebar "AI assistance" subtitle is a static read of cached analysis, not a live token meter

**Decision**: The AI sidebar footer shows `{model} · {totalTokens.toLocaleString()} tok` only when an `analysis` is cached. It does not poll, does not animate, does not show a per-session running cost.

**Rationale**: Spec FR-S03 asks for last-used model and last token total. A live cost meter is a v0.7+ "Cost dashboard" feature called out in the audit, not part of this release. Avoiding scope creep keeps the release coherent.

**Alternatives considered**:
- Include cost-per-1k pricing math. Rejected: requires a price table and a `cost dashboard` UI · separate release.

---

All decisions resolved. No outstanding NEEDS CLARIFICATION.
