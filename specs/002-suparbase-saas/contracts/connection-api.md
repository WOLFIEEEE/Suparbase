# Contract — Connection management API

All endpoints require a valid session; unauthorized requests return 401.
All endpoints verify ownership at the row level; cross-user access
returns 404.

## `GET /api/connections`

```ts
Response 200: ConnectionSummary[]
```

Sorted by `lastUsedAt desc`.

## `POST /api/connections`

```ts
Request body: { name: string; url: string; key: string }
Response 201: ConnectionSummary
Response 400: { category: "validation", message: string, field?: string }
Response 401: { category: "unauthorized" }
Response 409: { category: "constraint", message: "name already exists" }
```

Steps:

1. Validate `url` via the same regex used in v0.1.
2. Validate `key` is a JWT shape (three dot-separated segments).
3. Decode `role` from JWT payload.
4. Verify the key actually works by hitting the upstream `/rest/v1/`
   with `Accept: application/openapi+json` — if non-2xx, return 400
   with the appropriate category.
5. Encrypt the key via the vault.
6. Insert into `connections`.
7. Return summary (NO plaintext key).

## `GET /api/connections/:id`

```ts
Response 200: ConnectionSummary
Response 404: { category: "not_found" }
```

## `PATCH /api/connections/:id`

```ts
Request body: { name: string }   // only renames are supported in v1
Response 200: ConnectionSummary
Response 404: { category: "not_found" }
Response 409: { category: "constraint", message: "name already exists" }
```

## `DELETE /api/connections/:id`

```ts
Response 204
Response 404: { category: "not_found" }
```

Deletes the row. Audit log rows for this connection have their
`connection_id` set to NULL via FK action.

## Error envelope (shared)

```ts
interface ApiError {
  category:
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "validation"
    | "constraint"
    | "network"
    | "server"
    | "rate_limited"
    | "client_bug";
  message: string;
  field?: string;     // for validation errors that map to a form field
  columnHint?: string; // for constraint errors that map to a DB column
}
```

The browser's `toAppError()` helper converts these into the existing
`AppError` class used by `ErrorBanner`.
