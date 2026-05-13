# Contract — AI APIs

All routes are authenticated; unauthenticated requests return 401.
All routes verify ownership at the row level.

## `GET /api/settings/ai`

```
200 OK
{
  hasKey: boolean,
  defaultModel: string,
  lastAnalysisModel: string | null,
  lastAnalysisAt: string | null,
  lastPromptTokens: number | null,
  lastCompletionTokens: number | null,
  lastTotalTokens: number | null
}
```

Never returns the plaintext OpenRouter key.

## `PUT /api/settings/ai`

```
Body { key?: string; defaultModel?: string }
```

- If `key` is present and a non-empty string starting with `sk-or-`,
  the server probes `https://openrouter.ai/api/v1/models` with the
  key. On success, encrypt and persist; on failure, return 400.
- If `key` is the literal empty string `""`, the server clears the
  key (same as DELETE).
- If `defaultModel` is present, persist it as-is. (We do not validate
  the model name — OpenRouter rejects invalid ones at call time, and
  the user is responsible for choosing a model their key supports.)

Response: refreshed `AiSettingsSummary`.

## `DELETE /api/settings/ai`

Clears the encrypted OpenRouter key (but keeps `defaultModel` and the
last-usage metrics).

```
204 No Content
```

## `GET /api/ai/analyze/:connectionId`

Returns the cached `SchemaAnalysisResult` for the current schema
fingerprint, or `{ state: "not_cached" }` if none exists.

```
200 OK
SchemaAnalysisResult | { state: "not_cached" }

404 Not Found if the connection isn't owned by the caller
```

## `POST /api/ai/analyze/:connectionId`

Runs a fresh analysis. Sequence:

1. Resolve session + ownership.
2. Load the connection; introspect its schema server-side.
3. Compute `schemaFingerprint`.
4. Check cache. If a row exists AND the request body does not include
   `force: true`, return the cached row.
5. Check the rate limit (10 analyses / hour / user). Exceed → 429.
6. If the user has an OpenRouter key, decrypt it and call OpenRouter.
   On 2xx + valid Zod parse, write the cache row with `source: 'ai'`.
   On failure, fall through to step 7.
7. Run the heuristic. Write the cache row with `source: 'heuristic'`
   and zeroed token counts.
8. Return the result.

```
Body (optional) { force?: boolean }
200 OK SchemaAnalysisResult
429 Too Many Requests + Retry-After
404 Not Found
500 Server error (only if heuristic itself throws — defensive)
```

## OpenRouter wire format (server-internal)

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <plaintext-from-vault>
HTTP-Referer: <AUTH_URL>
X-Title: Suparbase
Content-Type: application/json

{
  "model": "anthropic/claude-3.5-haiku",
  "temperature": 0,
  "response_format": { "type": "json_object" },
  "max_tokens": 1500,
  "messages": [
    { "role": "system", "content": "You analyze database schemas..." },
    { "role": "user",   "content": "Schema:\npublic.users (id uuid pk, email text, ...)\n..." }
  ]
}
```

Response (relevant fields only):

```json
{
  "model": "anthropic/claude-3.5-haiku",
  "choices": [{ "message": { "content": "{\"tables\":[...]}" } }],
  "usage": { "prompt_tokens": 712, "completion_tokens": 318, "total_tokens": 1030 }
}
```

The handler parses `choices[0].message.content` as JSON and runs it
through the Zod validator before persisting.
