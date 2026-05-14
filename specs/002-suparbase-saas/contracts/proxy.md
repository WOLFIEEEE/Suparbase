# Contract: PostgREST Proxy

## Route

`/api/v/[connectionId]/rest/[...path]/route.ts` exports `GET`, `POST`,
`PATCH`, `PUT`, `DELETE`, and `HEAD` handlers. Each is identical except
for the verb: implemented via a single `proxyHandler(method, req,
ctx)` helper.

## Behavior

1. **Session check**: `await auth()` → if null, return 401.
2. **Connection lookup**: `select * from connections where id=:id`. If
   not found → 404.
3. **Ownership check**: `connection.userId === session.user.id`. If
   not → 404 (NOT 403; we don't acknowledge non-owned connections
   exist).
4. **Rate limit** (writes only): bucket per-user; 60/min default.
   Exceeded → 429 with `Retry-After`.
5. **Decrypt**: `decryptKey(connection.encryptedKey)` → plaintext key.
6. **Upstream URL**: `${connection.url}/rest/v1/${path}${search}`.
7. **Header construction**:
   - Allowed inbound headers (pass-through): `Range`, `Prefer`,
     `Content-Type`, `Content-Range`, `Accept`.
   - Strip: `Authorization`, `Cookie`, `apikey`, all `X-*` except
     `X-Forwarded-For` (we drop that too: Supabase doesn't need our
     internal IPs).
   - Inject: `apikey: <plaintext>`, `Authorization: Bearer <plaintext>`,
     `X-Client-Info: suparbase-saas/0.2`.
8. **Body**: forward request body as a `ReadableStream` for write
   verbs; size capped at 5 MB via `Content-Length` check.
9. **Forward**: `fetch(upstreamUrl, { method, headers, body, duplex:
   "half" })`.
10. **Response passthrough**: stream `upstream.body` back; preserve
    `Content-Type`, `Content-Range`, status.
11. **Audit log**: on write verbs with 2xx status, insert one audit
    row. The handler best-effort extracts a primary key from the
    request URL filter (e.g. `?id=eq.abc`) and stores it as JSONB.
    Insert verbs read the primary key from the upstream response body
    (Prefer: return=representation).
12. **Update `lastUsedAt`**: fire-and-forget UPDATE on
    `connections.last_used_at`.

## Audit log extraction

For `POST /rest/v1/posts` with body `{title: "..."}` and response
`{id: "uuid-...", title: "..."}` → audit:

```json
{
  "schema": "public", "tableName": "posts",
  "primaryKey": {"id": "uuid-..."},
  "verb": "insert", "httpStatus": 201
}
```

For `PATCH /rest/v1/posts?id=eq.uuid` body `{title: "..."}` → audit:

```json
{
  "schema": "public", "tableName": "posts",
  "primaryKey": {"id": "uuid"},
  "verb": "update", "httpStatus": 200
}
```

For `DELETE /rest/v1/posts?id=eq.uuid` → audit:

```json
{
  "schema": "public", "tableName": "posts",
  "primaryKey": {"id": "uuid"},
  "verb": "delete", "httpStatus": 204
}
```

When the request uses a composite key (`?col1=eq.a&col2=eq.b`),
the audit row records `{col1: "a", col2: "b"}`.

## Introspection endpoint

`GET /api/v/:id/introspect` is a thin wrapper:

1. Session + ownership check.
2. Decrypt.
3. Fetch `${url}/rest/v1/?apikey=<key>` with
   `Accept: application/openapi+json`.
4. Pass the body through `serverIntrospect()` to produce a `Schema`
   object identical to v0.1's shape.
5. Return `{ schema }` JSON.

The browser never sees raw OpenAPI; we expose only the post-processed
`Schema`.

## Errors

Any error path inside the handler returns an `ApiError` JSON body
with the right status code; all messages run through `redact()` first.
