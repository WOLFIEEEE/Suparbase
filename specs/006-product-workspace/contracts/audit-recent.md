# Contract: `GET /api/v/[id]/audit/recent`

The only new HTTP surface introduced by v0.6. Reads the user's own recent audit entries for a single connection to populate the Dashboard's recent-activity panel.

## Method & Path

```
GET /api/v/{connectionId}/audit/recent?limit=10
```

`connectionId` is the user's saved Suparbase connection id (UUID). It is **not** the Supabase project id.

## Authentication

- Requires a valid Suparbase session cookie (NextAuth JWT strategy).
- The handler MUST resolve the session and MUST verify that the connection row's `userId` matches `session.user.id`. Mismatch → `404 Not Found` (do not leak existence).

## Query parameters

| Param  | Type    | Default | Max | Description                                         |
|--------|---------|---------|-----|-----------------------------------------------------|
| `limit`| integer | `10`    | `25`| How many rows to return, newest first.              |

Values outside `[1, 25]` are clamped to the nearest bound; non-integer values fall back to the default.

## Response: `200 OK`

```json
{
  "entries": [
    {
      "id": "01HZ...ULID",
      "verb": "update",
      "tableSchema": "public",
      "tableName": "posts",
      "primaryKey": { "id": "42" },
      "createdAt": "2026-05-13T12:00:00.000Z"
    }
  ]
}
```

Field-by-field:

- `id`: opaque audit row id. Used as React key only; clients MUST NOT parse.
- `verb`: one of `"insert" | "update" | "delete"`.
- `tableSchema`, `tableName`: identify the table the write hit. Used to render a deep link via the existing table route.
- `primaryKey`: the affected row's primary key, as a JSON object keyed by column name. Used to build `/c/{id}/tables/{name}/{pk}` when present and non-empty; rendered as a non-link otherwise.
- `createdAt`: ISO-8601 UTC timestamp. The client formats with `relativeFromNow`.

## Response: error envelopes

All errors follow the project-wide `AppError` envelope already used by other routes (`src/lib/errors.ts`):

```json
{ "category": "unauthorized" | "not_found" | "rate_limited" | "server", "message": "..." }
```

| Status | Category        | When                                                              |
|--------|-----------------|-------------------------------------------------------------------|
| `401`  | `unauthorized`  | No session or expired session.                                    |
| `404`  | `not_found`     | Connection doesn't exist OR is owned by a different user.         |
| `429`  | `rate_limited`  | Exceeds the per-user token bucket (shared with proxy reads).      |
| `500`  | `server`        | Unexpected: payload is redacted by the existing logger.          |

## Rate limit

Shared with the existing proxy read bucket: no separate limit. The audit endpoint counts toward the same per-user budget as `/api/v/[id]/rest/*` reads.

## Caching headers

```
Cache-Control: private, no-store
```

The endpoint is per-user and per-connection. Never cached by intermediaries.

## Redaction

The audit row's `primaryKey` payload is run through the existing redactor (`src/server/audit/redact.ts` or equivalent) before serialization, stripping JWT-shaped substrings, `sk-or-*`, `sk-*`, and bcrypt prefixes. This is defensive: primary keys should never contain secrets: but it's the consistent treatment per Constitution Principle VII.

## Smoke test (manual)

```bash
# Replace with a real session cookie + connection id
COOKIE='next-auth.session-token=...'
CONN='123e4567-e89b-12d3-a456-426614174000'

curl -s -H "Cookie: $COOKIE" "http://localhost:3000/api/v/$CONN/audit/recent?limit=5" | jq
```

Expected: `{ "entries": [ ... ] }` with up to 5 entries, newest first.

## Out-of-scope (not in v0.6)

- Pagination beyond the 25-row max.
- Filtering by table, verb, or date range · that's the v0.9 "Audit log UI" feature.
- Streaming / Server-Sent Events for live updates · v0.10 "Realtime" feature.
