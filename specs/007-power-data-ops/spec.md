# Feature Specification: Power-User Data Ops

**Feature Branch**: `007-power-data-ops`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "Close the single biggest functional gap left after v0.6: the admin still operates one row at a time. v0.7 introduces bulk select + bulk delete + bulk update, CSV/JSON export and import, inline cell editing, saved views per table, and filter chips driven by column headers — all while every mutation still routes through the existing authenticated proxy and is recorded in the audit log."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Operate on many rows at once (Priority: P1)

A user managing a content site reviews 200 posts and decides to archive 30 of them. Today this would mean opening each row's detail page and changing the status one by one. After v0.7 they tick a row checkbox on each one, then in the toolbar that appears, click "Update column" → pick `status` → type `archived` → confirm. The 30 rows update in a single auditable batch with a 5-second undo. They can also bulk-delete a different selection the same way.

**Why this priority**: this is the single biggest "real admin" feature the product is missing. Without it Suparbase is a viewer, not an editor. P1.

**Independent Test**: open any table list page; verify a row checkbox column appears on the left of the row card, a "select all on this page" checkbox is in the toolbar, selecting any row reveals a sticky `BulkBar` showing the count and offering Delete / Update / Export actions; verify Delete on multiple rows asks for typed confirmation and produces one audit batch per click; verify Update on multiple rows applies the same value(s) to all selected rows.

**Acceptance Scenarios**:

1. **Given** a content-classified table with 30+ rows, **When** I tick the checkboxes on 5 rows, **Then** a sticky "BulkBar" appears showing "5 selected" with Delete / Update / Export buttons.
2. **Given** that bar is visible, **When** I click "Delete", **Then** a typed-confirmation dialog asks me to type the table name; after I type it and submit, the 5 rows are deleted in one round-trip and a 5-second undo toast offers to restore.
3. **Given** I've selected 5 rows, **When** I click "Update column" and pick a single column with a new value, **Then** the panel shows me a preview of what will change (row count, the affected column, the new value), confirming applies the update to every selected row in one batch.
4. **Given** I've selected 5 rows, **When** I navigate to page 2 of the table, **Then** the selection persists; the BulkBar still shows "5 selected" and the rows on page 2 are not auto-selected; ticking a row on page 2 brings the count to 6.
5. **Given** I've selected rows, **When** I click the "Clear" button on the BulkBar, **Then** every row is unselected and the BulkBar hides.
6. **Given** the typed confirmation dialog, **When** I type the wrong table name, **Then** the submit button stays disabled.

---

### User Story 2 — Export the current view to CSV or JSON (Priority: P1)

A user wants to share a list of users (filtered to `role = admin`) with their compliance team as a spreadsheet. They click "Export → CSV" in the toolbar. A file `users-2026-05-13.csv` downloads with one row per filtered user, columns matching the visible columns, and timestamps formatted as ISO 8601. They could also pick JSON; same shape, machine-readable.

**Why this priority**: every admin tool needs this. P1.

**Independent Test**: on a table with at least one filter chip applied, click the Export dropdown → CSV; verify the downloaded file contains only the filtered rows, header row matches the visible columns (excluding AI-hidden columns by default), the filename is `{table}-{YYYY-MM-DD}.{ext}`, and a "Include hidden columns" checkbox in the export menu, when ticked, includes them.

**Acceptance Scenarios**:

1. **Given** a `users` table with 250 rows and a filter `role = admin` applied (50 matches), **When** I click Export → CSV, **Then** a CSV downloads with 50 data rows + 1 header row, the columns match the visible columns, and the filename is `users-2026-05-13.csv`.
2. **Given** the same table, **When** I click Export → JSON, **Then** a JSON file downloads containing an array of 50 objects with the same field shape as the visible columns.
3. **Given** the analyzer has hidden `password_hash`, **When** I click Export → CSV without ticking "Include hidden columns", **Then** the password_hash column is not present in the export.
4. **Given** the analyzer has hidden `password_hash`, **When** I tick "Include hidden columns" and click Export, **Then** the column is present.
5. **Given** a table with 5000 rows, **When** I click Export → CSV, **Then** the download progresses incrementally and the UI does not freeze (the server streams rows; the client writes them as they arrive).
6. **Given** export of a table the proxy refuses (e.g. RLS denies SELECT), **When** the export fails mid-stream, **Then** a toast surfaces the partial-export message and the partial file is not deleted (the user can keep what they got).

---

### User Story 3 — Bring data in from a CSV or JSON file (Priority: P1)

A user with 80 new posts in a CSV (exported from a previous CMS) wants to load them all into Suparbase at once. They open the Import panel, drag the file in, and see a preview of the first 20 rows with their `title`, `body`, `slug`, `published_at` columns auto-mapped to matching table columns. One column — `author_email` — is mapped manually to the `author_id` column with the user picking "Resolve via lookup" and the panel runs a small batch FK lookup. The user chooses "Skip bad rows" for any FK violations, confirms, and watches a progress bar climb to 100%. The summary reports "76 imported, 4 skipped (FK lookup miss)".

**Why this priority**: the inverse of export, and the difference between "this is a viewer" and "this is an admin tool". P1.

**Independent Test**: on any writable table, open the Import panel; drag a CSV file in; verify the panel previews 20 rows, infers column mappings (case-insensitive), allows manual remapping, validates types against the schema, surfaces FK violations with row+column pinpointed, and on commit runs the import through the proxy with progress reported and a summary at the end.

**Acceptance Scenarios**:

1. **Given** the import panel is open, **When** I drag a 100-row CSV into it, **Then** within 1 second I see a preview of the first 20 rows with column mappings inferred by case-insensitive name match.
2. **Given** an unmapped column in the CSV, **When** I click the column header in the preview, **Then** a select lets me map it to any column of the target table — or to "Ignore".
3. **Given** a column mapping where the CSV value cannot be coerced to the target column type (e.g. text in a numeric column), **When** I look at the preview, **Then** that cell is marked with a red dot and the row is flagged as "type error".
4. **Given** a row references an FK by a label (e.g. `author_email`), **When** I map it as "Resolve via lookup" and pick the lookup column, **Then** the import resolves the label to the FK id at insert time, in batches of ≤500.
5. **Given** I click Import with "Skip bad rows" selected, **When** the import runs, **Then** valid rows are inserted in chunks, progress is reported as `imported / total`, and at the end a summary lists the count of skipped rows with their errors.
6. **Given** the import completes successfully, **When** I close the panel, **Then** the table list refreshes and the new rows are visible.
7. **Given** the import is in flight, **When** I click "Cancel", **Then** in-flight rows complete but no further rows are sent; a summary appears with the partial count.

---

### User Story 4 — Edit a cell without opening a modal (Priority: P2)

A user spots a typo in the `title` column of a row in the generic data grid. They click the cell once to focus it, double-click (or press Enter) to start editing, type the correction, and press Enter to commit. The cell flashes accent-green for ~400ms to confirm. They Tab to the next editable cell and keep going. No modal.

**Why this priority**: dramatic UX-speed improvement, but it only applies to the generic data grid (the archetype views already use cards). P2.

**Independent Test**: in `GenericAdmin` against a table with mixed column types, single-click any non-PK cell to focus it; press Enter (or double-click) to enter edit mode; verify the editor matches the column type (text input for strings, number for numerics, date picker for dates, switch for booleans, FK popover for FKs); commit with Enter, revert with Escape, Tab moves to the next editable cell; on error the cell pulses red and reverts.

**Acceptance Scenarios**:

1. **Given** the generic grid, **When** I single-click a cell, **Then** the cell receives a visible focus ring; pressing Enter (or double-clicking) enters edit mode with the column-type-appropriate editor.
2. **Given** I am editing a text cell, **When** I press Enter, **Then** the value is sent via the existing update path and on success the cell flashes accent-green and the editor closes.
3. **Given** the same cell, **When** I press Escape, **Then** the editor closes and the cell shows its original value unchanged.
4. **Given** I commit an invalid value (e.g. non-numeric in a numeric column), **When** the server rejects it, **Then** the cell pulses red, the error message is shown via toast, and the value reverts.
5. **Given** I'm editing, **When** I press Tab, **Then** focus moves to the next editable cell in the same row; Shift+Tab moves to the previous; arrow keys move between cells within the row.
6. **Given** the cell's column is an enum, **When** I enter edit mode, **Then** a select popover appears with the enum values; arrow keys + Enter pick one.
7. **Given** the column is an FK, **When** I enter edit mode, **Then** a small searchable popover lets me search the referenced table by its label column and pick a target.
8. **Given** the column is marked generated, primary-key, or hidden, **When** I single-click the cell, **Then** edit mode does not engage; the cell is read-only.

---

### User Story 5 — Save and switch named views per table (Priority: P2)

A user maintaining a `posts` table frequently filters to "status = published" sorted by `published_at desc`. They build the filter once, click "Save view" → name it "Published latest" → submit. The view appears as a tab on the page header. Next time they open the table they click that tab and the filter + sort apply instantly. They share the URL with a colleague; the colleague opens it and sees the same data.

**Why this priority**: a quality-of-life feature, valuable but smaller per-session impact than bulk/export/import/inline. P2.

**Independent Test**: build a filter+sort combination on a table; click "Save view"; verify a tab appears in the PageHeader; reload the page; verify the tab persists and the URL state still encodes the filter+sort so a fresh window with the same URL loads the same data.

**Acceptance Scenarios**:

1. **Given** I have built a filter+sort on a table, **When** I click "Save view" and enter a name, **Then** the view appears as a tab on the page header and persists across reloads.
2. **Given** I have a view named "Drafts", **When** I click that tab, **Then** the table applies the view's filter+sort, the URL updates to reflect the view's state, and other tabs become inactive.
3. **Given** I'm on a custom view, **When** I edit the filter (e.g. remove a chip), **Then** the tab shows an unsaved-indicator dot; clicking "Update view" persists; clicking "Discard" reverts.
4. **Given** I have a "Drafts" view, **When** I right-click (or click "⋯") on the tab, **Then** I can rename or delete it; the default "All" tab cannot be deleted.
5. **Given** I have created 5 custom views on a table, **When** I try to create a sixth, **Then** the "Save view" button is disabled with an explanatory tooltip; the user must delete an existing view to make room.
6. **Given** a second user signs into the same app, **When** they open the same table, **Then** they see only their own views and the default "All" — not the first user's views.

---

### User Story 6 — Filter without writing PostgREST (Priority: P2)

A user on a `users` table wants to find admins with `email` containing `acme.com` who signed in in the last 30 days. They click the `role` column header → choose `=` → type `admin` → a chip appears. They click `email` → `contains` → type `acme.com` → another chip. They click `last_sign_in_at` → `>=` → date picker → a third chip. Results narrow with each chip. They share the URL; the colleague gets the same view.

**Why this priority**: prerequisite for "saved views" being useful (US5), and a major UX upgrade vs. URL-editing today. P2.

**Independent Test**: from a list view, click any column header; verify a small popover appears with operators appropriate to the column type; pick one + enter a value; verify a chip appears in the toolbar; verify the list filters in place; verify the URL updates so the filter state is shareable; click the chip's `×` to remove; verify removal narrows the URL too.

**Acceptance Scenarios**:

1. **Given** a list view, **When** I click a column header, **Then** a popover offers operators appropriate to the column type (`=`, `≠`, `contains`, `starts with`, `is null`, `is not null`, `in`, `>`, `<`, `>=`, `<=`).
2. **Given** the popover, **When** I pick `=` and type a value, **Then** a chip `column = value` appears in the toolbar, the list filters, and the URL gains `&filter=column.eq.value`.
3. **Given** two chips, **When** I look at the list, **Then** results match BOTH conditions (AND); there is no OR builder in v0.7.
4. **Given** an `is null` chip, **When** I look at the list, **Then** the input is hidden — no value is needed.
5. **Given** an `in` chip, **When** I enter a comma-separated list, **Then** the chip renders as `column in (a, b, c)` and the URL encodes the same.
6. **Given** I click `×` on a chip, **When** the chip is removed, **Then** the list re-fetches without that condition and the URL no longer carries it.

---

### Edge Cases

- A user selects 5 rows then changes the filter, hiding some selected rows. The selection persists; the BulkBar still shows "5 selected" but only the visible matching rows are highlighted. Clicking "Clear" wipes the selection.
- A user selects 5 rows then refreshes the page. Selection is per-session and does not persist across reloads — the BulkBar disappears on reload.
- An export takes longer than 60s. The proxy continues to stream; the browser shows a progress indicator; the user can cancel. Cancelling does not destroy what's already been saved by the browser.
- An import file is larger than 50 MB. The import panel rejects the file with copy "files over 50 MB must be split — try `split -l 5000 file.csv`".
- An import row references an FK with a duplicate label (the lookup returns multiple matches). The row is flagged as "ambiguous"; the user must edit the cell manually or pick "Skip ambiguous".
- An inline cell edit triggers a server-side check that takes >2s. The cell shows a small spinner; the editor remains focused; the user can Escape to abort.
- A saved view references a column that has since been dropped from the table. The view is marked with an exclamation-mark icon and prompts the user to either delete it or open it for editing.
- A user attempts to bulk-delete every row in a table by ticking "select all on page" then clicking Delete. The typed-confirm dialog requires the table name; once confirmed, the delete proceeds in chunks; an audit row is recorded per row.
- A user attempts to bulk-update with no value entered for a chosen column. The submit button is disabled until at least one (column, value) pair is provided.
- A user is viewing a read-only view (`table.kind === "view"`). Bulk-delete and bulk-update are hidden; only Export is offered. Inline edit does not engage on these tables.

## Requirements *(mandatory)*

### Functional Requirements

**Bulk operations (FR-B01–FR-B08)**

- **FR-B01**: Every preset list view MUST render a per-row selection checkbox positioned to the left of the row content and a "select all on this page" checkbox in the toolbar.
- **FR-B02**: A sticky `BulkBar` MUST appear whenever at least one row is selected; it MUST display the selection count, a "Clear" button, and the available actions (Delete, Update column, Export selected).
- **FR-B03**: Selection MUST persist across pagination and across filter changes within the same session; selection MUST reset on page reload.
- **FR-B04**: Bulk delete MUST trigger a typed-confirmation dialog requiring the operator to type the exact table name; the submit button stays disabled until the typed value matches.
- **FR-B05**: A successful bulk delete MUST produce one audit row per affected row (matching the single-delete behaviour) and offer a 5-second undo toast that re-inserts the deleted rows.
- **FR-B06**: Bulk update MUST present a small panel listing the columns the user can choose, with the column's type-appropriate editor for the new value. The user can update one or more columns in a single batch.
- **FR-B07**: Bulk update MUST show a preview ("apply `status = archived` to 30 rows?") and a confirm step before any write.
- **FR-B08**: All bulk routes MUST be rate-limited with a tighter budget than single-row writes (suggested: 5 batches / minute / user, where one batch is one bulk request regardless of size).

**Export (FR-X01–FR-X06)**

- **FR-X01**: An Export button MUST appear in the toolbar of every list view and offer CSV and JSON variants.
- **FR-X02**: The export MUST honour the current filters, sort, and search; only rows that match the current view are exported. **Exception**: when the export is invoked from the BulkBar's "Export selected" button, the export targets the selected primary keys exactly and ignores other filters, sort, and search — the user has already curated the row set by hand.
- **FR-X03**: The export MUST exclude columns marked `hiddenColumns` in the analysis by default; a checkbox in the export menu re-includes them.
- **FR-X04**: The export filename MUST be `{table}-{YYYY-MM-DD}.{ext}`; the timestamp uses the user's local date.
- **FR-X05**: Exports of tables larger than 1000 rows MUST stream from the server; the browser writes rows as they arrive. The UI thread MUST remain responsive.
- **FR-X06**: A cancelled export MUST not delete the partially-written file in the user's browser.

**Import (FR-I01–FR-I08)**

- **FR-I01**: An Import panel MUST be reachable from the toolbar of every writable table.
- **FR-I02**: The panel MUST accept CSV (via drag, file picker, or paste) and JSON (via paste); the first 20 rows MUST appear as a preview within 1 second of file selection.
- **FR-I03**: Column mappings MUST be inferred by case-insensitive name match between source headers and target table columns; the user can manually remap any column or set it to "Ignore".
- **FR-I04**: Type validation MUST run client-side before submission; cells that cannot be coerced to the target column's type MUST be visibly flagged in the preview.
- **FR-I05**: FK columns MUST support "Resolve via lookup" — the user picks which source column carries the label, and the import resolves to the FK id in batches of ≤500 lookups per round-trip before insertion.
- **FR-I06**: Users MUST be able to choose between "Commit whole batch (all-or-nothing)" and "Skip bad rows" for handling validation/insert failures.
- **FR-I07**: Inserts MUST go through the existing proxy in chunks of ≤500 rows per round-trip; progress MUST be reported live as `imported / total`; at the end a summary lists skipped rows with their errors.
- **FR-I08**: Files larger than 50 MB MUST be rejected at the panel with explanatory copy.

**Inline editing (FR-E01–FR-E07)**

- **FR-E01**: In `GenericAdmin`, single-clicking a non-readonly cell MUST focus the cell with a visible focus ring; pressing Enter (or double-clicking) enters edit mode.
- **FR-E02**: The editor used MUST match the column's type: text/textarea for strings, number for numerics, native date input for datetimes, a Radix Switch for booleans, a small searchable popover for FKs, a select for enums.
- **FR-E03**: Pressing Enter MUST commit the value; pressing Escape MUST revert and close the editor; the existing `useUpdateRow` hook handles the network call.
- **FR-E04**: A successful commit MUST briefly pulse the cell accent-green (~400ms) and exit edit mode. A failure MUST pulse red, revert the value, and surface the error as a toast.
- **FR-E05**: Tab MUST move focus to the next editable cell in the same row; Shift+Tab MUST move to the previous. Arrow keys MUST move between cells within the same row when not in edit mode.
- **FR-E06**: Generated columns, primary-key columns, and columns explicitly listed in `analysis.hiddenColumns` MUST be read-only — single-clicking them MUST NOT engage edit mode.
- **FR-E07**: For read-only tables (`kind === "view"`), no cells engage edit mode regardless of column flags.

**Saved views (FR-V01–FR-V07)**

- **FR-V01**: Every list view MUST render a tab strip at the top showing "All" plus any saved views for that (user, connection, table); "All" is non-removable.
- **FR-V02**: A user MUST be able to save the current state (search, sort, filter chips, column visibility overrides) as a named view with a 1-character minimum, 40-character maximum name.
- **FR-V03**: Saved views MUST persist in the application database, scoped per (user_id, connection_id, schema, table_name).
- **FR-V04**: A user MUST not be able to create more than 5 custom views per table; the Save button disables with explanatory tooltip at the limit.
- **FR-V05**: A user MUST be able to rename or delete any of their own views via a context menu on the tab.
- **FR-V06**: A view that references a column no longer present in the table MUST be flagged in the tab strip and prompt the user to repair or delete it before applying.
- **FR-V07**: Views MUST NOT be shared between users; each user sees only their own.

**Filter chips (FR-F01–FR-F05)**

- **FR-F01**: Clicking any column header MUST open a popover offering operators appropriate to the column type (`=`, `≠`, `contains`, `starts with`, `is null`, `is not null`, `in`, `>`, `<`, `>=`, `<=` — subset by type).
- **FR-F02**: Submitting a filter MUST add a chip to the toolbar reading `column op value` and update the URL with a canonical `filter` query parameter.
- **FR-F03**: Multiple chips MUST combine with AND; an OR builder is explicitly out of scope for v0.7.
- **FR-F04**: Removing a chip MUST update both the list and the URL atomically.
- **FR-F05**: Filter chips MUST be keyboard-operable: Tab to focus, Enter to open the popover, Escape to close, the chip's `×` is a focusable button.

**Cross-cutting (FR-C01–FR-C04)**

- **FR-C01**: Every new mutation route (bulk delete, bulk update, import batch) MUST verify connection ownership before performing any write.
- **FR-C02**: Every new mutation route MUST record the affected rows in the existing audit log.
- **FR-C03**: Bulk delete MUST be reversible via the same 5-second undo pattern used by single-row delete.
- **FR-C04**: All new interactive UI MUST be keyboard-operable with visible focus, honour `prefers-reduced-motion`, and pass WCAG-AA contrast in both themes.

### Key Entities *(include if feature involves data)*

- **SavedView** (new): a per-user, per-connection, per-table named filter+sort+visibility snapshot. Fields: `id`, `userId`, `connectionId`, `tableSchema`, `tableName`, `name`, `state` (JSONB — search, sort, filters, hiddenColumns overrides), `createdAt`, `updatedAt`. Indexed by `(userId, connectionId, tableSchema, tableName)`.
- **AuditLog** (existing, unchanged): a bulk operation produces one row per affected primary key, identical in shape to a single-row mutation. The `verb` column distinguishes `insert | update | delete`.
- **TableAnalysis** (existing, unchanged): `hiddenColumns` is read by Export (excludes them by default) and Inline editing (marks them read-only).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can delete 50 rows from a table with a single confirmation and one audit batch in under 10 seconds, including the typed-confirm dialog.
- **SC-002**: A user can export a 5000-row table to CSV without the browser becoming unresponsive (no main-thread block longer than 100 ms during the export).
- **SC-003**: A user can import a 1000-row CSV into a writable table in under 30 seconds on a typical broadband connection, with progress visible throughout.
- **SC-004**: Inline cell editing reduces the time to fix a single typo from "open detail → click Edit → change cell → Save → close" (8+ keystrokes / clicks) to "click cell → type → Enter" (≤3 actions).
- **SC-005**: A saved view applies its full state (filter + sort + visibility) on click in under 200 ms (perceived as instant).
- **SC-006**: All new interactive UI passes a keyboard-only walkthrough of every acceptance scenario; no scenario requires a mouse.
- **SC-007**: The largest authenticated first-paint JS bundle remains ≤ 520 KB gzipped after v0.7 lands (Constitution Principle I).
- **SC-008**: No new dependencies are added; CSV parsing and JSON validation use existing project capabilities.
- **SC-009**: A bulk delete that fails mid-flight (network drop) leaves the audit log consistent with the database — no orphan audit rows for un-deleted entries, no missing audit rows for deleted entries.
- **SC-010**: A user creating their sixth custom view on a table sees a clear "limit reached" message; no silent failure.

## Assumptions

- The existing audit log shape (one row per `(user, connection, schema, table, primary_key, verb, http_status)`) is sufficient to represent bulk operations as multiple audit rows. No schema change to `audit_log` is required.
- The existing PostgREST proxy can be extended to issue batched `DELETE ... in.(id1,id2,...)` and `PATCH ... in.(id1,id2,...)` requests, so bulk mutations can land in 1 round-trip per chunk. The chunk size of 500 is chosen to stay under common URL-length limits for the `in()` filter; the server-side helper handles re-chunking transparently.
- The PostgREST proxy already streams large reads; exports can use the existing `Range` headers to fetch sequential pages and pipe them through to the browser without server-side buffering.
- No new dependencies. The hand-rolled CSV streaming parser lives at `src/lib/csv/`. JSON imports use native `JSON.parse` plus a small Zod validator that compares the parsed structure against the analyzed schema.
- The new `SavedView` table requires one Drizzle migration. It is the only schema change in v0.7.
- Bulk operations on more than 5000 rows in a single request are explicitly not supported in v0.7. The user gets a banner suggesting "Use a more specific filter, or split your selection".
- Per Constitution Principle VIII, all v0.7 data (views, audit) is scoped per user and per connection; there is no cross-user sharing.
- The taxonomy of archetypes (users/content/logs/generic) is unchanged. Adding more archetypes is sequenced into a later release.
- "Inline cell editing" applies to `GenericAdmin` only in v0.7; the archetype views (Users / Content / Logs) already have dedicated detail pages and richer editors. A future release may add inline edit to the archetype list cards but not in v0.7.
- The export pipeline does not transform values beyond CSV escaping (quotes, newlines) and JSON serialization. Date columns serialize as ISO 8601 UTC; JSONB columns serialize as their parsed object; bytea / binary columns are exported as base64-encoded strings.
