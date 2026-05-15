# Dashboards — charts and pinned queries (v2.2)

## Why
Suparbase is great at individual tables but has no overview. Every
team eventually wants one screen with their numbers — signups, MRR,
top products, error rate, weekly trends — and most build a custom
React dashboard just to host four chart cards.

## What
Per-connection dashboard widgets backed by SQL queries. Each widget
is a saved query plus a visualisation hint, rendered as a card on the
connection dashboard.

### Widget shape
```
dashboard_widget {
  id, user_id, connection_id,
  type        — "kpi" | "bar" | "line" | "list"
  title       — card heading
  description — short caption, optional
  sql         — read-only query, run via executeSql()
  vis_config  — type-specific JSON config:
    kpi:  { valueColumn, format?, unit?, prefix? }
    bar:  { labelColumn, valueColumn }
    line: { labelColumn, valueColumn }     // labelColumn is the x-axis
    list: { columns: string[] }            // visible columns, in order
  position    — integer (used to order widgets on the grid)
  span        — "1" | "2" | "full"        // 1=1 col, 2=2 cols, full=row
  refresh_sec — how often the client should re-fetch (0 = on demand)
  created_at, updated_at
}
```

### Surfaces
- New section on the connection dashboard (`/c/[id]`) above the
  table groups, rendered as a responsive grid (1 / 2 / 3 cols).
- `/c/[id]/dashboard/edit` — management page (list, add, edit,
  delete, reorder).
- Hover any widget to get a quick "Edit" / "Refresh" / "Delete"
  menu — keeps the dashboard editable without a context switch.

### Execution
- Every widget runs through the same `executeSql()` used by SQL
  playground + custom actions. Hard-coded `readOnly: true`,
  statement timeout 5s, row cap 1,000.
- Client caches per-widget results via React Query with the widget's
  `refresh_sec` (or staleTime: 30s when 0).

### Charts
- Hand-written SVG components (no chart lib). v1 supports:
  - `kpi`: single big number + optional unit/prefix, with a
    delta hint when the SQL returns a second numeric column named
    `previous` (e.g. last week's value).
  - `bar`: horizontal bars, top N. Labels left, value-bars right.
  - `line`: simple area+line chart over time. X axis labels are
    the labelColumn values, Y is autoscaled.
  - `list`: a small table, only the chosen columns.

## Safety
- Read-only execution always.
- Widget SQL is bound to the connection: we never run user-supplied
  cross-connection queries.
- Row count + cell character caps shared with SQL playground.

## Out of scope for v2.2
- Drag-and-drop reordering (use position field via Edit page).
- Cross-widget filters / dashboard-level params.
- Sharing dashboards across users (waits for v2.4 teams).
