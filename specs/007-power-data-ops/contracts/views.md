# Contract: `/api/views`

CRUD for `saved_views` rows. Owned strictly by the authenticated user;
no sharing in v0.7 per Constitution Principle VIII.

## Paths

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/views?connectionId=…&schema=…&table=…` | List the caller's views for one table. |
| POST | `/api/views` | Create a view. |
| PATCH | `/api/views/{id}` | Rename or update the state of an existing view. |
| DELETE | `/api/views/{id}` | Delete a view. |

## Auth + ownership

- Every request requires a valid NextAuth session.
- For GET / POST: the body / query carries a `connectionId`. The handler
  resolves it via `getConnectionForUser(session.user.id, connectionId)`;
  unknown or mismatched → `404`.
- For PATCH / DELETE: the handler reads `saved_views WHERE id = $1 AND user_id = $2`;
  not found → `404` (the row may exist but belong to another user: we
  don't distinguish).
- Rate-limited via the v0.6 `checkReadRate` bucket for GET, the existing
  `checkWriteRate` bucket for POST / PATCH / DELETE.

## GET /api/views: list

### Query parameters

| Param | Type | Description |
|---|---|---|
| `connectionId` | UUID | Required. |
| `schema` | string | Required. Default `"public"`. |
| `table` | string | Required. |

### Response: 200 OK

```json
{
  "views": [
    {
      "id": "01H...ULID",
      "name": "Published latest",
      "state": {
        "search": "",
        "sort": { "column": "published_at", "direction": "desc" },
        "filters": [
          { "column": "status", "op": "eq", "value": "published" }
        ],
        "hidden": []
      },
      "createdAt": "2026-05-12T12:00:00.000Z",
      "updatedAt": "2026-05-13T09:00:00.000Z"
    }
  ]
}
```

Empty list returns `{ "views": [] }`. The "All" default tab is rendered
by the client UI as the absence of a custom view and is **not** stored.

## POST /api/views: create

### Request

```http
POST /api/views
Content-Type: application/json
Cookie: next-auth.session-token=…

{
  "connectionId": "01H...UUID",
  "schema": "public",
  "table": "posts",
  "name": "Published latest",
  "state": {
    "search": "",
    "sort": { "column": "published_at", "direction": "desc" },
    "filters": [
      { "column": "status", "op": "eq", "value": "published" }
    ],
    "hidden": []
  }
}
```

- `name` length 1..40, trimmed before insert. Outside range → `400`.
- `state` validated against the Zod schema in [data-model.md §3](../data-model.md). Malformed → `400 constraint` with `columnHint: "state"`.
- Server counts existing rows for `(user, connection, schema, table)`;
  if already at 5 → `400 constraint` with `columnHint: "name"` and a
  human-readable message ("limit of 5 views per table reached").

### Response: 201 Created

```json
{
  "view": { ... }   // same shape as the list entry above
}
```

## PATCH /api/views/{id}: rename or update state

### Request

```http
PATCH /api/views/{id}
Content-Type: application/json
Cookie: next-auth.session-token=…

{
  "name": "Drafts only",          // optional: rename
  "state": { ... }                // optional: update state
}
```

At least one of `name` or `state` must be present; else `400`. `state`
fully replaces the previous value (not a partial merge). `updatedAt` is
bumped server-side.

### Response: 200 OK

```json
{ "view": { ... } }
```

## DELETE /api/views/{id}: delete

### Response: 204 No Content

Empty body. Idempotent: deleting an already-gone view returns 404, not
500.

## Error envelopes

Standard `AppError` shape. Status codes:

| Status | Category | When |
|---|---|---|
| 400 | `constraint` | malformed body, name out of length, state invalid, limit-of-5 reached. |
| 401 | `unauthorized` | No / expired session. |
| 404 | `not_found` | Connection missing / not owned, OR view id missing / belongs to another user. |
| 429 | `rate_limited` | The matching read or write bucket. |
| 500 | `server` | Unexpected DB error. |

## What this contract does NOT include

- Public / shared views. Out of scope per Principle VIII (no implicit
  sharing in v1).
- Default views per connection. The "All" tab is rendered client-side;
  there is no row for it.
- Server-side validation that view-referenced columns still exist on
  the table: that's deferred to the client at apply-time per
  [research.md Decision 8](../research.md).
