# Contracts — bulk-delete and bulk-update

Two POST endpoints under the existing proxy hierarchy. Both share the
same auth + ownership + audit + rate-limit posture as the single-row
write path.

## Common

- **Path prefix**: `/api/v/{connectionId}/rest/{tableName}/bulk-{verb}`
  where `verb ∈ { delete, update }`.
- **Method**: `POST`.
- **Auth**: NextAuth session cookie. Missing or expired → `401`.
- **Ownership**: handler verifies `connection.userId === session.user.id`
  via the existing `getConnectionForUser`. Mismatch → `404` (don't leak
  existence).
- **Rate limit**: new `checkBulkRate(userId)` bucket — 5 batches / minute.
  Exceeded → `429` with `Retry-After`.
- **Audit**: one `audit_log` row per affected primary key, written in
  the same transaction as the mutation. Reuses `recordAuditWrite()`.
- **Headers**: `Cache-Control: private, no-store`.

## bulk-delete

### Request

```http
POST /api/v/{connectionId}/rest/{tableName}/bulk-delete
Content-Type: application/json
Cookie: next-auth.session-token=…

{
  "primaryKeys": [
    { "id": "42" },
    { "id": "43" }
  ],
  "returnSnapshots": true
}
```

- `primaryKeys`: array of 1–5000 `PrimaryKeyValue` objects (composite PKs
  supported as multi-field objects). Outside that range → `400 constraint`.
- `returnSnapshots`: optional, default `true`. When true the response
  includes the full pre-delete row snapshots so the client can offer
  undo via the existing single-row re-insert path.

### Response — 200 OK

```json
{
  "deleted": 30,
  "snapshots": [
    { "id": 42, "title": "...", ... },
    { "id": 43, "title": "...", ... }
  ]
}
```

`deleted` is the count of rows actually removed (may be lower than the
input length if the row was concurrently deleted by another session;
the server treats those as no-ops, not errors). `snapshots` mirror the
shape of `getRow` results.

### Server-side flow

1. Resolve session → user.
2. `getConnectionForUser` → connection or `404`.
3. Validate `primaryKeys.length ∈ [1, 5000]`; else `400`.
4. `checkBulkRate(userId)`; else `429`.
5. For each chunk of ≤500 PKs:
   1. SELECT snapshots (if `returnSnapshots`).
   2. DELETE via PostgREST `?pk_col=in.(...)` under the existing
      `forward()` plumbing.
   3. INSERT N audit rows, one per affected PK.
6. Return aggregated `deleted` count + concatenated snapshots.

If any chunk fails, the handler returns `502` with the partial counts
in the body so the client can offer "you deleted X of Y — retry the
rest?".

### Error envelopes

| Status | Category | Cause |
|---|---|---|
| 400 | `constraint` | `primaryKeys.length < 1` or `> 5000`; malformed body. |
| 401 | `unauthorized` | No / expired session. |
| 404 | `not_found` | Connection missing or owned by another user. |
| 429 | `rate_limited` | Bulk bucket exhausted. |
| 502 | `server` | PostgREST returned an error mid-chunk. Body includes partial counts. |

## bulk-update

### Request

```http
POST /api/v/{connectionId}/rest/{tableName}/bulk-update
Content-Type: application/json
Cookie: next-auth.session-token=…

{
  "primaryKeys": [
    { "id": "42" },
    { "id": "43" }
  ],
  "patch": {
    "status": "archived",
    "archived_at": "2026-05-13T00:00:00.000Z"
  }
}
```

- `primaryKeys`: array of 1–5000 `PrimaryKeyValue` objects.
- `patch`: a non-empty `Record<string, unknown>` keyed by column name.
  Columns in the patch must exist on the table and must not be marked
  generated; else `400 constraint` with `columnHint` pointing at the
  bad column.

### Response — 200 OK

```json
{ "updated": 30 }
```

### Server-side flow

1. Resolve session → user.
2. `getConnectionForUser` → connection or `404`.
3. Validate `primaryKeys.length` + `patch` non-emptiness.
4. `checkBulkRate(userId)`.
5. For each chunk of ≤500 PKs:
   1. PATCH via PostgREST `?pk_col=in.(...)` with the patch body.
   2. INSERT N audit rows, verb=`update`, http_status=200.
6. Return aggregated `updated` count.

### Error envelopes

Same shape as bulk-delete. PostgREST constraint violations propagate
through with the existing `columnHint` extraction in
`src/lib/errors.ts`.

## Idempotency

Both endpoints are idempotent at the row level — re-running the same
request after a partial failure deletes/updates only the rows that
weren't already deleted/updated. There is no explicit idempotency key
in v0.7.

## What this contract does NOT include

- Cross-table bulk operations (e.g. "delete these posts AND all their
  comments"). Out of scope for v0.7.
- Soft-delete semantics. Not in scope; if the table has a soft-delete
  column the user's `patch` can set it but the proxy doesn't infer it.
- Async / background bulk jobs. v0.7 is strictly synchronous — large
  selections (max 5000 rows) complete within the 60-second request
  budget.
