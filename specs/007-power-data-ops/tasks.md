---

description: "Task list for v0.7 Power-User Data Ops"
---

# Tasks: Power-User Data Ops

**Input**: Design documents from `/specs/007-power-data-ops/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: NOT requested. Per v0.6 precedent the project's gating checks are `tsc --noEmit`, `next build`, and the manual smoke checklist in `quickstart.md`. CI (added in v0.6.1) enforces typecheck + build on every PR.

**Organization**: Tasks are grouped by user story (US1–US6) per [spec.md](./spec.md). Sequencing by priority: US1–US3 are P1 (the MVP slice); US4–US6 are P2. After Foundational, US1–US3 share the new `BulkBar` infrastructure but each story is independently demoable. US4–US6 are independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: runnable in parallel with other [P] tasks (different files, no dependencies on incomplete tasks).
- **[Story]**: user-story tag (US1–US6); omitted for Setup, Foundational, and Polish tasks.
- File paths are absolute from repo root.

## Path Conventions

Single Next.js app (per [plan.md](./plan.md) Project Structure):
- `src/app/`: routes (App Router)
- `src/components/`: UI (client components carry `"use client"`)
- `src/lib/`: types, helpers, client-side data hooks
- `src/server/`: server-only modules (never imported from client)
- `drizzle/`: generated migrations

---

## Phase 1: Setup

**Purpose**: confirm the working tree is green before touching anything.

- [x] T001 Run `pnpm typecheck` and `pnpm build` from the repo root to confirm the v0.6.1 baseline is green on branch `007-power-data-ops`. Abort if either fails.

---

## Phase 2: Foundational

**Purpose**: shared primitives that more than one user story depends on. **No user-story work begins until this phase is complete.**

- [x] T002 [P] Create `src/lib/filters/types.ts` with the `ChipSpec` type and `FilterOperator` enum from [data-model.md §3](./data-model.md).

- [x] T003 [P] Create `src/lib/filters/operators.ts` exporting `chipToPostgrest(chip: ChipSpec): string` (`{column}={op}.{value}` mapping per [research.md Decision 6](./research.md)). Pure function.

- [x] T004 [P] Create `src/lib/filters/parse-url.ts` exporting `parseFilterParams(searchParams: URLSearchParams): ChipSpec[]`: reads all repeated `filter=col.op.val` params.

- [x] T005 [P] Create `src/lib/filters/serialize-url.ts` exporting `serializeChipsToParams(chips: ChipSpec[], sp: URLSearchParams): URLSearchParams`: returns a fresh URLSearchParams with the existing non-filter keys plus one repeated `filter` per chip.

- [x] T006 Update `src/lib/pgrest/rows.ts` `ListParams` to accept `filters?: ChipSpec[]`, and have `listRows` translate each chip to a PostgREST query parameter via T003's helper. Backward-compatible: when absent, behaviour is unchanged. Depends on T002, T003.

- [x] T007 [P] Create `src/lib/csv/parse.ts` exporting an async-iterable `parseCsv(stream: ReadableStream<string>): AsyncIterable<Record<string, string>>`: RFC 4180 compatible (quoted fields, embedded quotes via `""`, embedded newlines, header row inferred). Pure module, no React. Per [research.md Decision 4](./research.md).

- [x] T008 [P] Create `src/lib/csv/serialize.ts` exporting `csvLineFromValues(values: unknown[]): string` and `csvHeaderLine(columns: string[]): string`. Quoting per RFC 4180; dates serialize via `toISOString()`; jsonb columns serialize via `JSON.stringify`.

- [x] T009 [P] Create `src/lib/csv/types.ts` with `PreviewRow`, `ColumnMap`, `RowError`, `ImportPhase`, `ImportSummary` types from [data-model.md §6](./data-model.md).

- [x] T010 [P] Create `src/lib/types/views.ts` with `SavedView` and `ViewState` types from [data-model.md §1.3](./data-model.md). Re-export `ChipSpec`.

- [x] T011 [P] Create `src/server/views/schema.ts` defining the Drizzle `savedViews` pgTable per [data-model.md §1.1](./data-model.md), with the per-table index. Type `SavedView`.

- [x] T012 Update `src/server/schema/index.ts` to re-export the `savedViews` table from T011. Depends on T011.

- [x] T013 Generate the migration: run `pnpm db:generate`, then rename the produced file to `drizzle/0003_saved_views.sql` if needed. Verify the file contains exactly one `CREATE TABLE saved_views` + one `CREATE INDEX saved_views_per_table_idx`. Depends on T012.

- [x] T014 [P] Create `src/server/views/repo.ts` exporting `listViewsForTable`, `createView`, `updateView`, `deleteView`. Each enforces `userId` scoping. `createView` rejects if 5 rows already exist for `(user, connection, schema, table)`; returns a structured constraint error with `columnHint: "name"`. Depends on T011.

- [x] T015 Extend `src/server/proxy/ratelimit.ts` with `checkBulkRate(userId): RateLimitResult`: 5 batches per minute per user. Reuses the existing token-bucket helper.

- [x] T016 [P] Create `src/components/data/SelectionContext.tsx` exporting `<SelectionProvider>` and `useSelection()` per [data-model.md §4](./data-model.md). State is `Set<string>` keyed by `encodePkSegment(row)`; provides `toggle`, `toggleMany`, `clear`. Client component.

**Checkpoint**: Foundation ready. The new types, helpers, filter library, CSV parser/serializer, Drizzle table + migration, server-side `savedViews` repo, and `checkBulkRate` bucket are all in place. User story work may now proceed in parallel.

---

## Phase 3: User Story 1: Bulk operations (Priority: P1) 🎯 MVP

**Goal**: Multi-row selection across pagination, plus bulk delete and bulk update with typed-confirmation, audit, undo, and rate-limit.

**Independent Test**: walk [quickstart.md §1](./quickstart.md): verify checkboxes appear, `BulkBar` shows count, bulk delete asks for typed confirm and produces one audit row per affected PK with 5-second undo, bulk update applies one or more columns to selected rows in one batch.

### Server-side

- [x] T017 [P] [US1] Create `src/server/proxy/bulk.ts`:
  - `bulkDelete({ session, connection, table, primaryKeys, returnSnapshots })`: chunks PKs ≤500, for each chunk SELECT snapshots → DELETE via PostgREST `?pk=in.(...)` under existing `forward()` → INSERT one `audit_log` row per affected PK (verb=`delete`). Returns `{ deleted, snapshots? }`.
  - `bulkUpdate({ session, connection, table, primaryKeys, patch })`: similar shape, PATCH instead, verb=`update`. Validates that `patch` is non-empty and that every key exists on the table and is not generated.
  - Both helpers run inside a Drizzle transaction so audit rows commit atomically with mutations.

- [x] T018 [US1] Create `src/app/api/v/[id]/rest/[name]/bulk-delete/route.ts`: POST handler per [contracts/bulk-mutations.md](./contracts/bulk-mutations.md). Session → ownership check → body validation (`primaryKeys.length ∈ [1, 5000]`) → `checkBulkRate` → call `bulkDelete` → 200 JSON. Depends on T017.

- [x] T019 [US1] Create `src/app/api/v/[id]/rest/[name]/bulk-update/route.ts`: POST handler per the contract. Same posture; calls `bulkUpdate`. Depends on T017.

### Client-side

- [x] T020 [P] [US1] Add `useBulkDelete(connectionId, table)` and `useBulkUpdate(connectionId, table)` to `src/lib/api/hooks.ts`. Each invokes the new route, on success invalidates the matching `rows` and `rowCount` query keys. Depends on T018, T019.

- [x] T021 [P] [US1] Create `src/components/data/BulkBar.tsx`: sticky bottom bar that mounts only when `selected.size > 0`. Shows the count, **Clear**, **Delete**, **Update column**, **Export selected** buttons. The Export action is wired in US2 (T028): render the button now, with the click handler stubbed.

- [x] T022 [P] [US1] Create `src/components/data/BulkDeleteDialog.tsx`: typed-confirm dialog (operator types the table name to enable submit). Reuses the styling of `DeleteRowDialog.tsx`. On confirm, calls `useBulkDelete.mutateAsync`. Shows undo toast (sonner) on success that re-inserts the returned `snapshots` via the existing `useInsertRow` hook.

- [x] T023 [P] [US1] Create `src/components/data/BulkUpdatePanel.tsx`: Radix Sheet panel listing the table's writable columns. The user picks one or more, each with the type-appropriate editor (text input / number / date / boolean Switch / FK popover / enum select), supplies a value, sees a preview (`apply {col}={val} to N rows?`), confirms. Calls `useBulkUpdate.mutateAsync`. Disables submit when no (column, value) pair is valid.

- [x] T024 [US1] Add per-row checkbox to row cards in `src/components/presets/UsersAdmin.tsx`, `src/components/presets/ContentAdmin.tsx`, `src/components/presets/LogsAdmin.tsx`. The checkbox sits to the left of the avatar/title and toggles `useSelection().toggle(encodePkSegment(row))`. Add a "Select all on this page" checkbox to the existing toolbar (above the rows list). Mount `<BulkBar />` near the bottom of each preset. Hide Delete + Update buttons when `table.kind === "view"`. Wrap the preset bodies in `<SelectionProvider>` so the bar and rows share state. **Implementation note (from `/speckit-analyze` F1)**: every preset's row currently wraps the entire card in an absolute-positioned `<Link>` overlay (`className="absolute inset-0"`) for click navigation. The new checkbox must (a) live *outside* the overlay's inset (change `inset-0` → e.g. `left-12 top-0 right-0 bottom-0`) so clicks land on the checkbox, and (b) the checkbox's own `onClick` MUST call `e.stopPropagation()` defensively. Depends on T016, T021, T022, T023.

- [x] T025 [US1] Smoke against [quickstart.md §1](./quickstart.md) (manual; can't run without a real connection). Verify rate-limit returns 429 with `Retry-After` on the 6th call within a minute.

**Checkpoint**: bulk delete and bulk update work on every preset. MVP-shippable on its own.

---

## Phase 4: User Story 2: Export (Priority: P1)

**Goal**: CSV / JSON streaming export from any list view, respecting filters / sort / hidden columns.

**Independent Test**: walk [quickstart.md §2](./quickstart.md). Export of a 5000-row table streams without freezing the UI.

### Server-side

- [x] T026 [P] [US2] Create `src/server/proxy/export.ts`:
  - `streamExportCsv({ connection, table, params, includeHidden }): ReadableStream<Uint8Array>`: fetches PostgREST pages of 1000 rows under the existing `forward()` Range plumbing, encodes each row via `csvLineFromValues` (from T008), and emits to the stream. Header line first.
  - `streamExportJson(...)`: same but emits `[`, comma-separated row JSON, `]`. Streams.
  - Both honour `params.filters`, `params.sort`, `params.search`. Hidden columns are removed from the emitted row unless `includeHidden`.

- [x] T027 [US2] Create `src/app/api/v/[id]/rest/[name]/export/route.ts`: GET handler per [contracts/export.md](./contracts/export.md). Session → ownership → `checkReadRate` → parse `format`, `columns`, `includeHidden`, `filter[]`, `order`, `q`, `limit` → invoke the stream helper → return `new Response(stream, { headers })` with `Transfer-Encoding: chunked`, `Content-Type: text/csv` or `application/json`, and `Content-Disposition: attachment; filename={table}-{YYYY-MM-DD}.{ext}`. Depends on T026.

### Client-side

- [x] T028 [P] [US2] Create `src/components/data/ExportMenu.tsx`: a DropdownMenu that opens with **CSV** and **JSON** items plus an **Include hidden columns** toggle. Each item builds the export URL from current list params (filters from URL + sort + search + visible columns) and triggers a navigation via `<a href={...} download={...}>`. No JS-side streaming on the client; the browser handles the download. Mount it inside the toolbar of every preset and inside the BulkBar's "Export selected" button (the bulk variant adds `?in_pk={…}` so the export is filtered to the selection).

- [x] T029 [US2] Wire the `ExportMenu` into each preset toolbar (`UsersAdmin`, `ContentAdmin`, `LogsAdmin`, plus `TableListView`). Mount the BulkBar's "Export selected" handler to the same component with `selection` props. Depends on T028, T024.

- [x] T030 [US2] Smoke against [quickstart.md §2](./quickstart.md).

**Checkpoint**: export works from every list view and from the bulk-selection bar.

---

## Phase 5: User Story 3: Import (Priority: P1)

**Goal**: Drag-CSV / paste-JSON, preview, infer mapping, validate types, resolve FKs by lookup, chunked insert with progress and audit.

**Independent Test**: walk [quickstart.md §3](./quickstart.md).

### Server-side

- [x] T031 [P] [US3] Create `src/server/proxy/import.ts`:
  - `importChunk({ session, connection, table, rows, onError })`: validates rows.length 1..500, then for each row runs the existing `coerceForWrite(table, row)` → POSTs to PostgREST under `forward()` → records audit. On `onError = "abort"`, any failure rolls back this chunk's audit rows and returns `4xx` with the offending row index. On `"skip"`, accumulates errors and returns 200 with `{ imported, skipped, errors }`.

- [x] T032 [US3] Create `src/app/api/v/[id]/rest/[name]/import/route.ts`: POST handler per [contracts/import.md](./contracts/import.md). Session → ownership → body validation → `checkBulkRate` → call `importChunk` from T031. Depends on T031.

### Client-side

- [x] T033 [P] [US3] Create `src/components/data/ImportPanel.tsx`: Radix Sheet that mounts on demand. Tabs: **CSV (drop or pick)** / **JSON (paste)**. Drives the `ImportPhase` state machine from `src/lib/csv/types.ts` (T009). On drop, uses `parseCsv` (T007) to stream the file, builds preview of first 20 rows, infers column mappings (case-insensitive). Files > 50 MB are rejected at the drop handler with the spec's copy.

- [x] T034 [P] [US3] Create `src/components/data/ImportPreviewTable.tsx`: renders preview rows with per-column mapping selects (each cell shows raw + coerced + red dot on error). Allows the user to map any source column to a target column or **Ignore**. For FK target columns, exposes the **Resolve via lookup** option that uses `useReferenceLabels` to batch-resolve labels → ids before insert.

- [x] T035 [P] [US3] Add `useImportChunk(connectionId, table)` to `src/lib/api/hooks.ts`. Implements the chunked submit loop with per-chunk progress reporting via callbacks; obeys `onError` mode. Returns `{ run(rows, opts), cancel(), state }`. Depends on T032.

- [x] T036 [US3] Wire ImportPanel into the toolbar of writable tables in `UsersAdmin`, `ContentAdmin`, `TableListView` (Generic). Hidden for `table.kind === "view"`. Depends on T033, T034, T035.

- [x] T037 [US3] Smoke against [quickstart.md §3](./quickstart.md).

**Checkpoint**: import works end-to-end with progress + cancel + summary.

---

## Phase 6: User Story 4: Inline cell editing (Priority: P2)

**Goal**: Single-click edit on every editable cell in the generic data grid, with type-appropriate editors and full keyboard support.

**Independent Test**: walk [quickstart.md §4](./quickstart.md).

- [ ] T038 [P] [US4] Create `src/components/data/InlineCell.tsx`: a client component that wraps a cell with focus + edit state. Read-only when the column is generated, primary-key, in `analysis.hiddenColumns`, or table kind is view. Editors are switched by column type:
  - `string` / `text` → `<input>` or `<textarea>` based on max length.
  - `integer` / `float` → `<input type="number">`.
  - `boolean` → Radix `<Switch>`.
  - `date` / `datetime` → `<input type="date">` / `datetime-local`.
  - `enum` → Radix `<Select>` over `column.enumValues`.
  - `fk` → small searchable Radix `<Popover>` over the referenced table's labels (reuses existing `useReferenceLabels`).
  - `json` → fallback to a small textarea editor with JSON-parse on commit.

- [ ] T039 [P] [US4] Inside `InlineCell`, wire keyboard handling: single-click focuses with a visible ring; Enter or double-click enters edit mode; Enter commits via the prop-supplied `onCommit`; Escape reverts; Tab moves to the next editable sibling via `nextEditableCell()` helper (look at the DOM in the same row); Shift+Tab moves to the previous; arrow keys (when not editing) move between cells in the same row.

- [ ] T040 [P] [US4] Add success/error visual states to `InlineCell` (CSS-only): a one-shot accent-green flash on commit (`@keyframes` gated by `prefers-reduced-motion`), a red pulse on failure that reverts the value.

- [ ] T041 [US4] Wire `InlineCell` into `src/components/data/DataGrid.tsx` (used by Generic). Replace the existing static cell rendering with `<InlineCell>` per cell. Skipped for archetype list views since those use cards. Depends on T038, T039, T040.

- [ ] T042 [US4] Smoke against [quickstart.md §4](./quickstart.md).

**Checkpoint**: inline editing works in `GenericAdmin` / `TableListView`. No regressions in archetype views.

---

## Phase 7: User Story 5: Saved views (Priority: P2)

**Goal**: Save / rename / delete named views per table, applied via a tab strip on every preset.

**Independent Test**: walk [quickstart.md §5](./quickstart.md).

### Server-side

- [ ] T043 [P] [US5] Create `src/app/api/views/route.ts`: GET (list) + POST (create) handlers per [contracts/views.md](./contracts/views.md). Session → ownership check via `getConnectionForUser` → for POST, count existing rows and reject when 5 already exist (`400` with `columnHint: "name"`). Depends on T014.

- [ ] T044 [P] [US5] Create `src/app/api/views/[id]/route.ts`: PATCH (rename/update) + DELETE handlers. `404` when the row id is missing or owned by another user. Depends on T014.

### Client-side

- [ ] T045 [P] [US5] Create `src/lib/api/views.ts` exporting `useSavedViews(connectionId, schema, table)`, `useCreateView`, `useUpdateView`, `useDeleteView`: react-query wrappers that target the `/api/views` routes from T043 + T044.

- [ ] T046 [P] [US5] Create `src/components/data/ViewTabs.tsx`: tab strip rendering "All" plus the user's custom views for the current (connection, schema, table). Each tab has a `⋯` menu with **Rename** / **Delete**. The active tab is accent-tinted (matches the v0.6 sidebar active state). Clicking a tab updates the URL with the view's `state` (filters, sort, search, hidden), then `useRows` re-fetches via the existing list params. Disabled "Save view" button when 5 custom views exist.

- [ ] T047 [P] [US5] Add a **Save view** button + dialog to the existing list-page toolbars. Captures the current URL state (filters, sort, search, hidden) into a `ViewState`, prompts for a name, calls `useCreateView`. On the active custom view, shows **Update view** + **Discard** when state diverges from the saved snapshot. Depends on T045.

- [ ] T048 [US5] Update `src/components/workspace/PageHeader.tsx` to accept an optional `tabs?: React.ReactNode` prop and render it just under the title row. Mount `<ViewTabs />` as the `tabs` prop in `UsersAdmin`, `ContentAdmin`, `LogsAdmin`, and `TableListView`. Depends on T046.

- [ ] T049 [US5] Implement the "column dropped" detection: on tab apply, compare each `ChipSpec.column` and `sort.column` in the view's `state` against `table.columns`. If any column is missing, mark the tab with the warning glyph and prompt the user to repair or delete before applying.

- [ ] T050 [US5] Smoke against [quickstart.md §5](./quickstart.md), including the second-user isolation step.

**Checkpoint**: saved views land cleanly. The "All" tab is rendered everywhere; custom views persist per (user, connection, table).

---

## Phase 8: User Story 6: Filter chips (Priority: P2)

**Goal**: Click a column header → pick an operator → enter a value → chip → URL updates → list re-fetches. Multiple chips combine with AND.

**Independent Test**: walk [quickstart.md §6](./quickstart.md).

- [ ] T051 [P] [US6] Create `src/components/data/FilterPopover.tsx`: Radix Popover that mounts on click of a column header. Shows operators appropriate to the column's `category` (`eq`/`neq`/`contains`/`starts with`/`is null`/`not null`/`in` for strings; `gt`/`lt`/`gte`/`lte`/`eq`/`neq`/`is null`/`not null` for numerics/datetimes; `in`/`eq`/`is null` for enums; `eq`/`neq` for booleans). Submits a `ChipSpec` via prop callback.

- [ ] T052 [P] [US6] Create `src/components/data/FilterChip.tsx`: Badge variant showing `column op value`, with a focusable `×` button. Keyboard: Tab focuses, Enter opens an edit popover (same component as T051) over the chip, Escape closes.

- [ ] T053 [US6] Add the column-header click handler to every list view: wrap the column-name text in a `<button>` that toggles a `<FilterPopover>`. Apply to row-card headers in `UsersAdmin`, `ContentAdmin`, `LogsAdmin` (where there's no header, expose the same filter UI from a small "Filter" button in the toolbar that lists every column). Apply to actual column headers in `TableListView`. Depends on T051.

- [ ] T054 [US6] Wire chip add / remove to URL state via T004 + T005 (`parseFilterParams` / `serializeChipsToParams`). On change, `router.push` so the URL becomes the canonical state. Depends on T002–T006.

- [ ] T055 [US6] Render the active chips in the toolbar above the rows (a horizontally scrolling row of `<FilterChip>`s). Hide when no chips are active. Depends on T052.

- [ ] T056 [US6] Smoke against [quickstart.md §6](./quickstart.md).

**Checkpoint**: filter chips work; saved views (US5) now have something interesting to save.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T057 [P] Remove the now-redundant in-toolbar "search" UI on `TableListView` if it duplicates a filter chip on a text column. Keep it on the preset list views where the search-across-text-cols affordance is genuinely faster than chips.

- [ ] T058 [P] Audit `src/components/row/RowDrawer.tsx` usage. With inline edit landed in v0.7 and detail-page nav landed in v0.6, confirm the drawer is only referenced from `TableListView`. If unused elsewhere, leave the file (still the fallback for the generic view) but add a comment noting the v0.7 scope.

- [x] T059 Run `pnpm typecheck`. Fix any errors. Green output required.

- [x] T060 Run `pnpm build`. Verify it succeeds. Inspect the Next.js build output for the largest first-paint JS bundle on an authenticated route. Confirm it remains ≤ 520 KB gzipped (Constitution Principle I). Record the measurement for the PR description.

- [ ] T061 Walk [quickstart.md](./quickstart.md) §1–§8 top to bottom on a connection that has at least the required fixtures from §Prerequisites. All checkboxes pass.

- [ ] T062 Update `CHANGELOG.md` with a new v0.7.0 entry. Reference [specs/007-power-data-ops/](./) and list the new endpoints (`bulk-delete`, `bulk-update`, `export`, `import`, `/api/views`), the new `saved_views` table, the new `checkBulkRate` bucket, and the v0.6.1 CI / OSS-readiness work bundled in.

- [ ] T063 Update `README.md`: add a "What's new in v0.7" block at the top; bump the version badge to `v0.7.0`; extend the Spec-Kit artifacts list to include v0.7; refresh the Status block to reflect v0.7 shipped and v0.8 next.

- [ ] T064 Commit on `007-power-data-ops`; open a PR to `main`. The PR description quotes the success criteria from [spec.md §"Measurable Outcomes"](./spec.md) and the bundle measurement from T060.

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup
  ↓
Phase 2 Foundational  ◄── blocks every user story below
  ↓
Phase 3 US1 (P1, MVP) ─┐
Phase 4 US2 (P1)       ├── parallel-able after Foundational; US2 depends on T024 for the BulkBar "Export selected" wiring
Phase 5 US3 (P1)       │
Phase 6 US4 (P2)       │
Phase 7 US5 (P2)       │: depends on URL filter wiring from US6, so US6 should land first OR ship in the same branch
Phase 8 US6 (P2)       │
  ↓
Phase 9 Polish         ── runs after all stories merged
```

### Inter-task dependencies (foundational)

- T006 ← T002, T003
- T012 ← T011
- T013 ← T012
- T014 ← T011

### Inter-task dependencies (per story)

- US1: T018 ← T017; T019 ← T017; T020 ← T018, T019; T024 ← T016, T021, T022, T023.
- US2: T027 ← T026; T029 ← T028, T024.
- US3: T032 ← T031; T035 ← T032; T036 ← T033, T034, T035.
- US4: T041 ← T038, T039, T040.
- US5: T045 ← T043, T044; T048 ← T046; T046, T047 ← T045.
- US6: T053 ← T051; T054 ← T002–T006; T055 ← T052.

### Parallel opportunities

- Phase 2 has high parallelism: T002, T003, T007, T008, T009, T010, T011 are all `[P]`.
- US1 server-side helpers and client-side leaf components are parallel: T021, T022, T023 land independently before T024 stitches them.
- US3 client leaf components (T033, T034, T035) are parallel.
- US5 client + server work is parallel (T043, T044, T045, T046, T047).
- Across stories: after Foundational, US1 + US3 + US4 are fully independent. US2 needs T024's BulkBar to exist for the "Export selected" path; if a developer takes US2 alone, they can stub that path and connect later. US5 functionally needs US6's URL-filter wiring to be meaningful, so order them US6 → US5 if a single developer is doing both.

---

## Parallel example: Phase 2 Foundational

```bash
Task: "T002 filter ChipSpec types"
Task: "T003 chipToPostgrest helper"
Task: "T004 parseFilterParams"
Task: "T005 serializeChipsToParams"
Task: "T007 CSV parser"
Task: "T008 CSV serializer"
Task: "T009 import-panel types"
Task: "T010 SavedView types"
Task: "T011 savedViews Drizzle table"
# After T011:
Task: "T012 re-export savedViews"
Task: "T014 saved_views repo helpers"
# After T012:
Task: "T013 generate Drizzle migration"
# After T002 + T003:
Task: "T006 wire ChipSpec[] into listRows"
Task: "T015 checkBulkRate bucket"
Task: "T016 SelectionContext provider"
```

## Parallel example: Phase 3 US1 Bulk operations

```bash
# Once Foundational is done:
Task: "T017 bulk.ts server helpers"
# After T017:
Task: "T018 bulk-delete route"
Task: "T019 bulk-update route"
# After T018 + T019:
Task: "T020 useBulkDelete + useBulkUpdate hooks"
# In parallel with T020:
Task: "T021 BulkBar component"
Task: "T022 BulkDeleteDialog"
Task: "T023 BulkUpdatePanel"
# Once all of T020-T023 land:
Task: "T024 wire into UsersAdmin / ContentAdmin / LogsAdmin"
Task: "T025 smoke quickstart §1"
```

---

## Implementation Strategy

### MVP first (US1 + US2 + US3)

The three P1 stories together are the v0.7 MVP. Implementing all three before any P2 is the recommended order:

1. Phase 1 + 2: Foundational primitives.
2. Phase 3 US1: bulk operations. The BulkBar lands first because it's the architectural anchor for selection state.
3. Phase 4 US2: export. Reuses BulkBar's "Export selected" pathway; faster to land after US1.
4. Phase 5 US3: import. Independent of US1/US2 but the largest single piece of UI; saving it for last lets it borrow the BulkBar styling and the table-toolbar pattern.
5. **STOP and validate**: quickstart §1 + §2 + §3 + §7 (constitution gates) + §8 (regression). Demo this slice.

The MVP at this point is shippable on its own as v0.7-rc1 if the team wants an intermediate release.

### Incremental delivery after MVP

- **US4 Inline editing**: a contained surface (`GenericAdmin` only). Ship it after MVP is green.
- **US6 Filter chips** before **US5 Saved views**: saved views without URL filter state are degenerate (you can save "All" but nothing else useful). Ship US6, then US5.
- Polish (Phase 9) runs once the last P2 story merges.

### Parallel team strategy

With multiple developers after Foundational:

- Dev A: US1 → US3 (server-heavy P1 work).
- Dev B: US2 → US6 → US5 (the URL/filter axis).
- Dev C: US4 (cell-edit work is self-contained).

Inter-story merge conflicts are minimal: only `RowPresetRouter`/`PageHeader` are shared, and each story touches a different region of those files. Apply the v0.6 lesson from `/speckit-analyze` F1: when two tasks edit the same file, merge them into one foundational task instead. We already grouped T024 to be a single edit across all three preset files; same for T048 (PageHeader tabs slot) and T053 (column-header click handler across presets).

---

## Notes

- Total tasks: **64**.
- Per-story counts: US1=9, US2=5, US3=7, US4=5, US5=8, US6=6. Setup=1, Foundational=15, Polish=8.
- Suggested MVP scope: **Setup + Foundational + US1 + US2 + US3** (37 tasks) · bulk ops + export + import together. Demo-able as "Suparbase v0.7-rc1".
- Tests are not generated; CI (added in v0.6.1) gates typecheck + build automatically.
- Commits should follow the v0.5 / v0.6 prefix conventions (`feat:`, `fix:`, `chore:`, `refactor:`), with bodies that explain *why* and reference the relevant FR or SC ids from [spec.md](./spec.md).
- The new `saved_views` migration is the only schema change in v0.7. Coolify deploys pick it up automatically via the entrypoint's `node dist/migrator.mjs` step.
