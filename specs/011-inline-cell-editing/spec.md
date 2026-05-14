# Inline cell editing (v1.2)

## Goal
Edit a row's field in place on the detail page without entering the full
"edit mode" form. Click the value, type, blur or Enter to commit;
Escape to cancel.

## Scope
- Detail pages for all archetypes (Users, Content, Logs, Commerce, Tasks,
  Messages, Generic).
- Editable categories: string, text, integer, float, boolean, enum, date,
  datetime, uuid.
- Read-only categories: json (still shows pretty-print), foreign keys,
  generated columns, primary key columns.
- Read-only contexts: `view` kind tables, tables without a primary key.

## UX
- Field display shows value with a faint pencil icon on hover.
- Click or double-click → input replaces the value.
- Enter commits; Escape cancels; Shift/Cmd+Enter on multi-line textareas.
- Success → green toast `Updated <column>`.
- Failure → red toast with the server's message; field reverts.
- Currency cells in Commerce stay read-only-formatted; the rest of the
  Commerce columns are editable.

## Server
No new endpoints. Uses the existing `PATCH /api/v/[id]/rest/[table]?<pk>`
via `useUpdateRow`.

## Out of scope (deferred)
- Inline edit on list views (still click-to-detail).
- FK column picker (still read-only display).
- Inline JSON editor (still pretty-print only).
