# Custom actions, row workflows and table-level buttons (v2.1)

## Why
Suparbase is great at the generic CRUD shape: list rows, filter, edit,
delete, run SQL. But every ops team eventually hits a wall that
sounds like *"I need a button that calls our business logic."*

- Refund this order.
- Approve this seller.
- Resend the invite email.
- Mark this ticket as escalated, tag the customer, and notify Slack.

Without these, teams peel off and build a separate React admin to
host their three or four buttons. v2.1 keeps them on Suparbase.

## What
A connection-scoped registry of named actions, each backed by a SQL
template, a Postgres function (RPC), or an HTTP webhook. Actions are
shown as buttons on table pages and row detail pages, scoped to where
they apply.

### Action shape
```
custom_action {
  id, user_id, connection_id,
  name       , slug-style, used in URLs and audit
  label      , human label on the button
  description, one-liner shown in tooltip / management page
  scope      , "global" | "table" | "row"
  table_schema, table_name , required when scope ≠ "global"
  kind       , "sql" | "webhook"
  sql_template      , for kind="sql": parametrised SQL ($1, $2 …)
  webhook_url       , for kind="webhook"
  webhook_method    , "POST" | "PATCH" | "DELETE"
  webhook_headers   , JSON object, optional
  params     , JSON Schema array: [{ name, label, type, required }]
  danger     , boolean: forces a confirm dialog and red styling
  read_only  , boolean: if true, the action runs in a READ ONLY tx
  created_at, updated_at
}
```

Scopes:
- **global**, button shows on the connection dashboard
- **table**, button shows in the table header
- **row**, button shows on the row detail page; the row's primary
  key is auto-bound to the first SQL `$1` / first webhook path
  segment

### Execution path
1. Client opens the action: if `params` is non-empty, render a small
   form modal. If `danger=true`, render a confirm step.
2. Client POSTs to `/api/connections/[id]/actions/[actionId]/execute`
   with `{ params, primaryKey }`.
3. Server:
   - Loads the action, verifies the user owns the connection.
   - For `kind="sql"`: calls the same `executeSql()` used by the SQL
     playground. Read-only flag is honoured. Statement timeout
     defaults to 10s.
   - For `kind="webhook"`: fires the HTTP request with parameters
     interpolated into URL/body. Response captured.
   - Writes an `audit_log` entry with `verb="custom_action"` so the
     run shows up in row history.
4. Client renders a result card: row count + sample (SQL) or status
   + response body (webhook). Invalidates row caches for the table.

### Surface
- Sidebar gains "Actions" (next to "Auth users").
- `/c/[id]/actions`, management page (list, create, edit, delete).
- Table header, action button group (table-scoped only).
- Row detail page, action button group (row-scoped + table-scoped
  that don't require a row PK).

## Safety
- SQL templates run with `executeSql()`: same row-cap, transaction
  semantics, RLS path as the SQL playground.
- Webhook requests are server-side: no CORS leakage, no key exposure.
  Headers are sealed-blob storage but for v2.1 we accept that the
  user is the one who configured them.
- Every execution is rate-limited (reuses `checkAiRate` style limit).
- Danger actions get a typed-confirmation step (must re-type the
  action name).

## Out of scope for v2.1
- Per-row bulk actions (run on N selected rows). v2.x.
- Action composition / chaining. v2.x.
- Action templates / marketplace. Later.
