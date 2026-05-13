# Contract — `GET /api/v/[id]/rest/[name]/export`

Streams the current filtered list view to the browser as CSV or JSON.

## Path

```
GET /api/v/{connectionId}/rest/{tableName}/export
```

## Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `format` | `"csv" \| "json"` | `"csv"` | Output format. |
| `columns` | `string` | (visible columns minus AI-hidden) | Comma-separated list of column names to include. Server respects this verbatim. |
| `includeHidden` | `"0" \| "1"` | `"0"` | If `"1"`, AI-hidden columns are included in the default visible set. |
| `filter` | `string` (repeated) | — | PostgREST-style filter, one per filter chip. Same syntax as the list view. |
| `order` | `string` | (table PK ascending) | PostgREST `order` value, e.g. `created_at.desc`. |
| `q` | `string` | — | The list view's text search term; expanded server-side into an `or(...)` ilike filter as in the existing list path. |
| `limit` | integer | `100000` (hard cap) | Refuses to export more than the cap; client suggests "apply more filters". |

## Auth + ownership + rate limit

Same posture as the existing `rest/[...path]` proxy:
- Requires a valid NextAuth session.
- Verifies `connection.userId === session.user.id`; mismatch → `404`.
- Counts against the existing `checkReadRate` bucket (v0.6 introduced).

## Response

### CSV

```http
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="{table}-{YYYY-MM-DD}.csv"
Cache-Control: private, no-store
Transfer-Encoding: chunked
```

Body: one header row + one row per matching record, RFC 4180 quoting.
Datetimes serialize as ISO 8601 UTC; JSONB columns serialize as their
parsed JSON value inside a quoted CSV field; bytea is base64-encoded.
Server-side: pages are fetched from PostgREST in chunks of 1000 rows
using the `Range` header; each chunk is encoded and pushed to the
response stream immediately — never buffered in full.

### JSON

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Disposition: attachment; filename="{table}-{YYYY-MM-DD}.json"
Cache-Control: private, no-store
Transfer-Encoding: chunked
```

Body: a streamed JSON array. The server writes the opening `[`,
each row as JSON joined by `,`, then the closing `]`. Date types and
JSONB follow native JSON serialization.

## Error envelopes

Standard `AppError` body shape; first error response terminates the
stream cleanly (the client may keep what's already been written by the
browser per Constitution Principle VI safety).

| Status | Category | Cause |
|---|---|---|
| 400 | `constraint` | `limit > 100000`, malformed filter syntax, unknown column. |
| 401 | `unauthorized` | No / expired session. |
| 404 | `not_found` | Connection missing / not owned. |
| 429 | `rate_limited` | Read bucket exhausted. |
| 502 | `server` | PostgREST upstream error mid-stream. The error is emitted as a trailing JSON comment line (CSV) or after the closing bracket (JSON), so the consumer can detect partial outputs. |

## Cancellation

The handler observes `req.signal`. When the user closes the tab or
clicks "Cancel" in a future progress UI, the upstream PostgREST request
is aborted on the next chunk boundary. No locking on the user's
database — the only resource is the open HTTP connection.

## Client integration

The browser triggers the download via `<a href="..." download>` (no
fetch in JS), so the browser's built-in download manager handles the
progress bar and partial-file behaviour. The `ExportMenu` builds the URL
from the current `useRows` list params + the user's CSV/JSON choice and
sets the `download` attribute. No JS-side streaming code on the client.

## What this contract does NOT include

- Server-side caching (each request streams fresh).
- Compressed downloads (the browser negotiates gzip with the Next.js
  server; we don't manually zip).
- Multi-table joins (single table only — joins live in the v0.8 SQL
  editor surface).
