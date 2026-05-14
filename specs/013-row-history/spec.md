# Row history panel (v1.2)

## Goal
Show a chronological history of every change made to a single row,
directly on the row detail page. Each entry is a clickable timeline
item that expands into a column-level diff.

## Schema
Migration `drizzle/0004_faithful_rattler.sql` adds two columns to
`audit_log`:
- `before_row jsonb` — populated on DELETE (and reserved for future
  pre-fetch UPDATE capture).
- `after_row jsonb` — populated on INSERT and UPDATE.

Existing rows have nulls in both — old history items still render but
show no column diff.

## Capture
The proxy already clones successful write responses. We extended
`extractAuditFromRequest` to:
- read the cloned body
- treat it as `afterRow` on POST/PATCH
- treat it as `beforeRow` on DELETE

Client helpers `insertRow` / `updateRow` already set
`Prefer: return=representation`. We extended `deleteRow` to do the same
so the upstream echoes the deleted row back.

Bulk operations and writes without `return=representation` continue to
work — they just don't populate the snapshot columns.

## API
`GET /api/v/[id]/audit/row?table=<name>&pk=<json>` →
`{entries: HistoryEntry[]}` where each entry carries verb, timestamp,
status, and the two snapshots. PK match uses Postgres `jsonb @> jsonb`.

## UX
- Right-rail section "History" on every detail page, below "Linked
  records".
- Collapsed list with `<verb pill> <N columns changed> <relative time>`.
- Click to expand: column-level diff with `from → to` for updates,
  `+value` for inserts, strike-through for deletes.
- Diffs compare each entry's `afterRow` to the previous entry's
  `afterRow` (or `beforeRow`) so a true column-by-column view appears
  even when only `after` was captured.

## Out of scope
- Restore-from-history (clicking an old entry to roll back the row).
- Pre-fetch BEFORE state on UPDATE.
- Bulk-update / bulk-delete diff capture.
