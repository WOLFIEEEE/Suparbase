# Quickstart — verifying the v0.7 release

Manual smoke walk-through that maps to spec acceptance criteria. Run
after `pnpm typecheck`, `pnpm db:push`, and `pnpm build` on the
`007-power-data-ops` branch.

## Prerequisites

1. A Suparbase deploy from this branch with the new `saved_views`
   migration applied (`pnpm db:push`).
2. A connected Supabase project with, at minimum:
   - a writable content-classified table (e.g. `posts`) with at least
     50 rows of varied status,
   - a writable users-classified table with at least 20 rows,
   - one read-only `VIEW` for the read-only checks,
   - one table with an FK to another (e.g. `posts.author_id` → `users.id`).
3. A second user account in Suparbase for the multi-tenant isolation
   checks.
4. A 1000-row CSV file on disk for the import smoke (`posts-import.csv`).
5. A second 50 MB CSV file (synthetic) for the file-size-limit check.

## 1. Bulk operations — User Story 1

- [ ] On `posts`, tick row checkboxes on 5 rows. The sticky **BulkBar**
      appears showing "5 selected" with **Delete**, **Update column**,
      **Export selected**, and **Clear**.
- [ ] Click **Delete**. A typed-confirm dialog asks for the table name.
      Submit stays disabled until the name matches exactly.
- [ ] After confirm, 5 rows are removed; an undo toast appears with 5
      seconds remaining. Clicking **Undo** re-inserts the 5 rows.
- [ ] Reselect 5 different rows and click **Update column**. Pick
      `status`, enter `archived`, see the preview "apply `status =
      archived` to 5 rows", confirm; all 5 rows now show
      `status: archived`.
- [ ] Tick 5 rows on page 1, navigate to page 2 (no auto-selection
      there), tick 1 row on page 2. BulkBar shows "6 selected".
- [ ] Click **Clear** — BulkBar disappears, no rows highlighted.
- [ ] On a read-only `VIEW`, verify BulkBar shows only **Export
      selected** (no Delete / Update buttons).
- [ ] Verify the audit log via the Dashboard's Recent activity panel —
      one entry per bulk-affected row, verb=`delete` or `update`.
- [ ] Hit the bulk endpoint 6 times in a minute; the 6th call returns
      `429 rate_limited` with a `Retry-After` header.

## 2. Export — User Story 2

- [ ] On `users` with a filter `role = admin` applied, click
      **Export → CSV**. File `users-{YYYY-MM-DD}.csv` downloads.
      Open it: only the filtered rows present, header row matches the
      visible columns, no `password_hash` column.
- [ ] Click **Export → JSON** with same filter. File downloads with an
      array of objects, same column set.
- [ ] Open the export menu, tick **Include hidden columns**, export
      again. `password_hash` and other AI-hidden columns appear.
- [ ] Run an export on a 5000-row table. Browser shows a progress
      indicator from the download manager; the Suparbase UI thread
      stays responsive (no scroll jank, palette opens instantly).
- [ ] Open browser DevTools → Network. The export response has
      `Transfer-Encoding: chunked` and `Cache-Control: private, no-store`.
- [ ] Mid-export, click the download manager's cancel. The
      partially-written file remains on disk (browser default).

## 3. Import — User Story 3

- [ ] Click **Import** on `posts`. The ImportPanel opens (Radix Sheet,
      slide from right).
- [ ] Drag `posts-import.csv` into the drop zone. Within 1 second the
      first 20 rows render with column headers inferred (case-
      insensitive) to target table columns.
- [ ] Click an unmapped column header. A select offers every target
      column or **Ignore**. Pick one.
- [ ] On a column with a type mismatch (e.g. text in numeric column),
      that cell is red-dotted and the row is flagged "type error".
- [ ] On `posts.author_id`, click the mapping → **Resolve via lookup** →
      pick the source column (e.g. `author_email`). The preview now
      shows resolved FK ids for rows where the lookup matched, and
      "FK lookup miss" for rows where it didn't.
- [ ] Choose **Skip bad rows** → click **Import**. A progress bar climbs
      from `0/1000` to `1000/1000` over ≤30 seconds on a normal
      connection. Summary reports `N imported, K skipped`.
- [ ] Click **Close**. The list view refreshes; new rows are visible.
- [ ] Mid-import, click **Cancel**. In-flight chunk completes; further
      chunks don't fire. Summary shows partial counts.
- [ ] Drag the 50 MB file. The panel rejects it with the explanatory
      copy.
- [ ] Verify the audit log via Recent activity: one `insert` entry per
      imported row.

## 4. Inline cell editing — User Story 4

- [ ] On any generic-grid (Generic) table, single-click a `title` cell.
      The cell receives a visible focus ring.
- [ ] Press Enter (or double-click). A text editor appears with the
      current value selected.
- [ ] Type a correction → Enter. The cell flashes accent-green
      (~400 ms) and shows the new value.
- [ ] Single-click the next cell → Tab → focus moves to the next
      editable cell in the same row.
- [ ] Escape during editing reverts to the original value.
- [ ] Commit an invalid value (e.g. text in a numeric column). Cell
      pulses red, value reverts, toast surfaces the error.
- [ ] Single-click a primary-key or generated cell. Edit mode does not
      engage; cell is read-only with `aria-readonly`.
- [ ] On a column with `analysis.hiddenColumns` entry, cell is also
      read-only (matches the same flag rule).
- [ ] On an enum column, Enter → a select popover with the enum values
      → arrow keys + Enter pick one.
- [ ] On an FK column, Enter → a small searchable popover → search by
      label → Enter picks; the cell shows the FK label, not the raw id.
- [ ] Enable `prefers-reduced-motion` in OS settings. Reload. Edit a
      cell — the flash and red-pulse are suppressed; everything else
      still works.

## 5. Saved views — User Story 5

- [ ] On `posts`, build a filter `status = published` + sort
      `published_at desc`. Click **Save view** in the toolbar → name it
      `Published latest` → submit.
- [ ] The view appears as a tab in the PageHeader, next to **All**.
- [ ] Click **All**. The filter clears, URL drops the filter param.
- [ ] Click **Published latest**. The filter + sort re-apply. URL
      reflects the view's state.
- [ ] Reload. The tab persists; clicking it still applies.
- [ ] Copy the URL with the view active, open in an incognito window
      signed in as the same user — same data.
- [ ] On the active view's tab, adjust the filter (remove a chip). The
      tab shows an unsaved-changes dot. Click **Update view** → tab
      becomes clean; click **Discard** → reverts.
- [ ] Click the tab's `⋯` menu → **Rename**. Rename to `Drafts only`.
- [ ] Click the tab's `⋯` menu → **Delete**. Tab disappears.
- [ ] Create 5 custom views. **Save view** button disables with a
      tooltip explaining the limit.
- [ ] Sign in as the second user. Open the same table. None of the
      first user's views are visible.

## 6. Filter chips — User Story 6

- [ ] On `users`, click the `role` column header. A popover appears
      with operators (`=`, `≠`, `contains`, `starts with`, `is null`,
      `is not null`, `in`) appropriate to text columns.
- [ ] Pick `=`, type `admin`, submit. A chip `role = admin` appears in
      the toolbar; list filters; URL adds `&filter=role.eq.admin`.
- [ ] Click `email` column header → `contains` → `acme.com` → second
      chip; results narrow (AND).
- [ ] Click `last_sign_in_at` column header → `>=` → date picker → ISO
      date; third chip appears; results narrow further.
- [ ] Click `×` on the first chip. URL drops that filter; list widens.
- [ ] Try an `is null` chip on a nullable column — no value input
      needed; chip reads `column is null`.
- [ ] Try an `in` chip on `status`: enter `published,draft` — chip
      reads `status in (published, draft)`.
- [ ] Tab to the toolbar → chips are focusable; Enter on a chip opens
      its edit popover; Escape closes.

## 7. Constitution gates

- [ ] `pnpm typecheck` passes with no errors.
- [ ] `pnpm build` succeeds.
- [ ] The largest authenticated route's First Load JS in the
      `pnpm build` output stays ≤ 520 KB gz. Record the number in the
      PR description.
- [ ] `rg "console\.(log|warn|error)" src/` returns nothing.
- [ ] CI (`.github/workflows/ci.yml`) goes green on the PR.
- [ ] No new dependencies in `package.json`.
- [ ] Every new interactive UI element is keyboard-operable with
      visible focus.
- [ ] `prefers-reduced-motion` suppresses the inline-edit flash, red-
      pulse, and BulkBar slide-in.

## 8. Regression check

- [ ] Existing single-row CRUD still works on every preset.
- [ ] Existing undo on single-row delete still works.
- [ ] The Cmd/Ctrl+K command palette still works on every workspace
      route.
- [ ] The theme toggle still has no flash on reload.
- [ ] Workspace sidebar still sticky; topbar still sticky with
      backdrop blur.
- [ ] Account routes (`/connections`, `/settings`) still render with
      the `AppHeader` + `AppFooter` shell.

When every checkbox passes, v0.7 is ready to merge.
