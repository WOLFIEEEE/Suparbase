# Personal home board (v3.4)

## Why
Suparbase opens onto a list of tables. For day-to-day use that is
the wrong landing page. Operators have 3-5 tables they actually live
in (`orders`, `users`, `support_tickets`...) and 5-10 columns of each
they care about. Everything else is noise they scroll past.

`/c/[id]/dashboard` (v2.2) already covers charts and SQL widgets,
but those answer aggregate questions ("how many signups this week").
What's missing is a curated **row view** across multiple tables on
one screen, owner-defined, no SQL required.

v3.4 adds that screen. Plays nicely with the billing tiers we
shipped in v3.3 (specs/032): free users can pin up to 10 tables x
10 columns each, paid users have no cap.

## What ships

### Widget type extension
No new table. Reuse `dashboard_widget` from v2.2 by adding a new
`type`: `table_snippet`.

```
visConfig (for type = "table_snippet"):
  tableName    string                      // schema-qualified, e.g. "public.orders"
  columns      string[]                    // <= 10, in display order
  filter?      SavedViewFilter (v0.7)      // reuses saved-view filter shape
  sort?        { column, direction }       // optional, defaults to PK desc
  limit        integer                     // 1..50, default 10
  rowLink?     "detail" | "none"           // click row -> /c/[id]/t/[table]/r/[pk], default "detail"
```

`sql` is left empty for `table_snippet` widgets, the server builds
it from `visConfig` at query time (see Execution). Filter + sort
reuse the saved-view machinery from specs/008 so we don't fork the
filter UI.

### Plan limits
Extend `PLAN_LIMITS` in `src/server/billing/plans.ts`:

| Limit | Free | Hosted | Team |
|---|---|---|---|
| `tableSnippets.maxPerConnection` | 10 | infinite | infinite |
| `tableSnippets.maxColumnsPer`    | 10 | infinite | infinite |

Both caps enforced server-side at create / update via
`requireFeature(userId, "tableSnippets.maxPerConnection")`. Route
catches `PlanLimitError` and returns 402 with
`category: "plan_limit"`, same shape as the existing connection cap.

UI shows live counter ("7 / 10 pinned") and an upgrade chip on the
Home board edit page when on `free`.

### Execution: batched fetch
Naive impl runs one proxy round-trip per widget. With 10 widgets
that's 10 sequential network hops on every page load. We add:

`POST /api/connections/[id]/widgets/home/batch`
  body: `{ widgetIds: string[] }`
  resp: `{ results: Record<widgetId, BatchResult> }` where
        `BatchResult = { ok: true, rows, columnsMeta } | { ok: false, error, kind }`

Server-side: loads the widgets in one DB query, builds each
`SELECT cols FROM table WHERE filter ORDER BY sort LIMIT n`, runs
them through `executeSql({ readOnly: true })` in parallel with
`Promise.allSettled`. Hard caps: 5s per-widget timeout, 50 rows max
per widget (clamped from `visConfig.limit`).

Client caches per-widget via React Query, key
`["home-widget", widgetId, version]`. `version` bumps on widget edit
so cached rows invalidate cleanly. Default `staleTime: 30s`.

### Schema drift
A pinned widget breaks if the table is renamed or a column is
dropped. On batch fetch we compare `visConfig.columns` against the
live schema (already cached by the schema-introspect layer used by
the row detail page) and:

- Missing table: result is `{ ok: false, kind: "table_missing" }`,
  card shows a "Table no longer exists" state with `Remove` button.
- Missing columns: result is `ok: true` with `columnsMeta[col].missing = true`
  for the dropped columns, card renders those cells as `--` and shows
  a banner with `Repair`. Repair opens the editor pre-populated with
  the still-existing columns.

We deliberately don't auto-remove broken widgets: the user pinned
them on purpose and a transient migration shouldn't nuke their layout.

### UI

**Home board** at `/c/[id]` (the connection landing page):
- New "Pinned" section rendered above the existing table groups.
- Empty state: a single CTA card ("Pin your first table") + a
  3-card example screenshot.
- Responsive 12-col grid. Each snippet card has:
  - Header row: table name (linked to full table view), column count,
    overflow menu (Edit / Refresh / Remove).
  - Compact table: chosen columns, sticky header, `limit` rows.
    Type-aware cell renderers shared with the existing row detail
    page (jsonb truncated to 60 chars, timestamps as relative time,
    bytea / vectors shown as `<binary>`).
  - Footer: "N of M rows. View all ->" linking to the full table.
- Click a row -> existing row detail page (`rowLink: "detail"`).
- Card span defaults to `"1"` for snippets <= 4 columns, `"2"` for
  5-8 columns, `"full"` for 9-10. Owner can override in the editor.

**Builder** at `/c/[id]/dashboard/edit` (extend the existing page):
- "Add pinned table" button alongside the existing chart-widget
  buttons.
- Modal: searchable table picker (reuses the table list from the
  sidebar) -> column multi-select with type icons -> optional filter
  chip builder (reuses saved-view filter UI) -> sort picker -> title
  override. Save closes modal and inserts at end of position list.
- Cap counters live in the modal footer ("Columns: 6 / 10",
  "Pinned tables: 7 / 10"). Save button disabled when over cap.

### API
- `POST /api/connections/[id]/widgets` already exists for v2.2,
  extend its zod validator to accept `type: "table_snippet"` with the
  new `visConfig` shape. Plan-limit check fires here.
- `PATCH /api/connections/[id]/widgets/[widgetId]` same extension.
- `DELETE` unchanged.
- `POST /api/connections/[id]/widgets/home/batch` new, see Execution.

## Visibility model
Widgets are private to the creator in v1. On a team-shared
connection, alice's pinned tables are not visible to bob. This
sidesteps the PII concern (an editor with table-level access could
otherwise pin a sensitive column into a viewer's face) and matches
how saved views already behave.

A future spec will add "shared boards" once we have a column-level
ACL story. Out of scope here.

## Safety
- Read-only execution via existing `executeSql({ readOnly: true })`.
- Server constructs the SQL from `visConfig`. The only user-supplied
  strings that hit SQL are filter values, which go through the same
  parameter-binding the saved-view filter API already uses. Column
  and table names are validated against the live introspection
  result before SQL build, so a stale `visConfig.columns` value can
  never inject a column that doesn't exist.
- Hard caps: 50 rows per widget, 5s per-widget statement timeout,
  10 widgets per connection on free / unlimited on paid, parallel
  fan-out bounded at 10 concurrent executions per batch call.
- Plan-limit checks at write time only. Read-time does not gate on
  current plan, so a user who downgrades after pinning 15 widgets
  keeps seeing them but can't add more until they delete some. We
  surface a banner explaining this on the Home board for downgraded
  users.

## Out of scope for v3.4
- **Shared / team boards.** Each user's pins are private to them on
  the connection. Sharing waits for a column-level ACL.
- **Aggregate snippets.** Use the existing `kpi` / `bar` / `line`
  widget types for counts and trends. `table_snippet` is row-level
  only.
- **Inline editing inside the snippet card.** Click-through to the
  row detail page (v1.2, specs/011) for edits. Adding inline edit
  here would duplicate the click-to-edit machinery.
- **Drag-and-drop reordering on the Home board.** Position is set
  via the edit page, same as chart widgets.
- **Global date / dashboard-level params.** Each widget carries its
  own filter.
- **Custom-action buttons on snippet rows.** specs/025 actions are
  table-scoped already, surfacing them here doubles the surface area
  without a clear win; revisit if asked for.

## Migration
Single drizzle migration (0016):
- Add `'table_snippet'` to the `dashboard_widget.type` check (it's
  stored as text + `$type<WidgetType>()` in drizzle, so this is a
  TS-only widening; no DDL strictly needed, but we'll add a
  CHECK-constraint refresh for clarity).
- No data backfill, existing widgets keep working unchanged.
