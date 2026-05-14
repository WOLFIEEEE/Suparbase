# Contract: `POST /api/v/[id]/rest/[name]/import`

Accepts a single chunk (≤500 rows) of an import operation. The client
chunks the source file and POSTs one chunk at a time so progress is
visible to the user and partial failures are isolable.

## Path

```
POST /api/v/{connectionId}/rest/{tableName}/import
```

## Request

```http
POST /api/v/{connectionId}/rest/{tableName}/import
Content-Type: application/json
Cookie: next-auth.session-token=…

{
  "rows": [
    { "title": "First post", "slug": "first", "status": "draft" },
    { "title": "Second post", "slug": "second", "status": "draft" }
  ],
  "onError": "skip"
}
```

| Field | Type | Description |
|---|---|---|
| `rows` | `Record<string, unknown>[]` | 1–500 rows, each keyed by target table column name. The client has already done column mapping and type coercion before sending. |
| `onError` | `"skip" \| "abort"` | `"skip"`: malformed rows are skipped, the rest are inserted; failures surface in the response. `"abort"`: any failure rejects the whole chunk and rolls back its audit entries. Default `"abort"`. |

## Auth + ownership + rate limit

- Requires a valid NextAuth session.
- Verifies `connection.userId === session.user.id`; mismatch → `404`.
- Counts against `checkBulkRate(userId)` · shares the bulk budget with
  bulk-delete and bulk-update (5 batches/min/user). Each *chunk* counts
  as one batch; a 5000-row import burns 10 buckets total.

## Response: 200 OK

```json
{
  "imported": 498,
  "skipped": 2,
  "errors": [
    { "index": 13, "column": "author_id", "reason": "fk violation" },
    { "index": 42, "column": "title", "reason": "value too long" }
  ]
}
```

- `imported`: rows successfully inserted in this chunk.
- `skipped`: rows that failed validation/insert (only > 0 when `onError = "skip"`).
- `errors`: one entry per skipped row; the `index` is the position
  within the request's `rows` array (0-based), not the source file line
  number (the client maps back to file line numbers).

When `onError = "abort"` and any row fails, the handler returns the
appropriate 4xx/5xx, no rows are committed, no audit rows are written.

## Server-side flow

1. Resolve session → user.
2. `getConnectionForUser` → connection or `404`.
3. Validate `rows.length ∈ [1, 500]`; else `400`.
4. `checkBulkRate(userId)`; else `429`.
5. For each row:
   1. Run the existing `coerceForWrite(table, row)` to apply type
      rules (generated-column stripping, JSON parsing, datetime
      normalization).
   2. POST the coerced row to PostgREST under the existing `forward()`
      plumbing.
   3. On success: `INSERT INTO audit_log` (verb=`insert`, http_status=201).
   4. On failure with `onError = "abort"`: roll back this chunk's audit
      rows, return `4xx`.
   5. On failure with `onError = "skip"`: append to `errors`, continue.
6. Return aggregated counts + errors.

Rolling back audit rows on abort means the audit table truthfully
reflects what's actually in the database: never claims a write that
didn't happen.

## Error envelopes

| Status | Category | Cause |
|---|---|---|
| 400 | `constraint` | `rows` out of range, malformed body, unknown column. `columnHint` set when the offending column is identifiable. |
| 401 | `unauthorized` | No / expired session. |
| 404 | `not_found` | Connection missing / not owned. |
| 409 | `constraint` | Unique-constraint or FK violation when `onError = "abort"`. Body contains the PostgREST error message with the existing `columnHint` extraction. |
| 429 | `rate_limited` | Bulk bucket exhausted. |
| 502 | `server` | Unexpected PostgREST upstream error. |

## What this contract does NOT include

- A PostgREST bulk-insert path (`POST` with an array body). Discussed
  in `research.md` Decision 5: out of scope for v0.7.
- Async import progress endpoints (websockets / polling). The client
  drives chunking and reports progress entirely from the chunk responses
  it gets back.
- CSV / JSON parsing on the server. The client parses, validates types,
  and only sends fully-typed JSON.
- FK label resolution. The client's ImportPanel handles "Resolve via
  lookup" client-side using the existing `useReferenceLabels` plumbing
  before sending the resolved FK ids.
