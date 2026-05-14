# Phase 0: Research (delta from v0.2)

## 1. OpenRouter as the AI gateway

**Decision**: OpenRouter's OpenAI-compatible Chat Completions API
(`POST https://openrouter.ai/api/v1/chat/completions`), hit via raw
`fetch`. Default model: `anthropic/claude-3.5-haiku` (fast, cheap,
strong at structured JSON output).

**Rationale**: One key, ~200 models, OpenAI-compatible payload. No
SDK is needed; the surface we use is small (`messages`, `model`,
`response_format: { type: "json_object" }`, `temperature: 0`).

**Headers required**: `Authorization: Bearer <key>`, `HTTP-Referer`
(set to our deploy URL), `X-Title: Suparbase`.

**Alternatives considered**:
- Vercel AI SDK: nice ergonomics, larger dependency, multi-provider
  abstractions we don't need for v1.
- LangChain: out of proportion to the task.

## 2. Prompt design

We send a stable system prompt + a compact user message that lists
each table and its columns in one line per column. We do NOT send row
data, comments that may contain PII, or sample values.

Output: strict JSON, validated against:

```ts
z.object({
  tables: z.array(z.object({
    name: z.string(),
    schema: z.string(),
    category: z.enum(["users", "content", "logs", "generic"]),
    displayName: z.string(),
    listColumns: z.array(z.string()).max(6),
    statusColumn: z.string().nullable().optional(),
    titleColumn: z.string().nullable().optional(),
    notes: z.string().max(120).optional(),
  })),
});
```

`temperature: 0` for determinism; `max_tokens: 1500` for a 20-table
schema; `response_format: { type: "json_object" }` to force JSON.

## 3. Heuristic fallback

When the AI is unavailable (no key, transient failure, malformed
response), we still want presets to do something useful. A pure
heuristic in `src/lib/presets/heuristic.ts` classifies each table by
name + columns:

- `users` if name matches `^(users|profiles|members|accounts)$` AND
  any column matches `email|username|handle`
- `logs` if name matches `^(events?|logs?|activit(?:y|ies)|audit.*)$`
  OR contains both `created_at` and no obvious title column
- `content` if name matches `^(posts|articles|pages|blog.*|stories)$`
  OR columns include any of `title|slug` AND any of `body|content|markdown`
- otherwise `generic`

The heuristic shares the `TableAnalysis` shape with the AI output, so
downstream code is identical.

## 4. Caching strategy

`schema_fingerprint = sha256(sorted(${schema}.${table}|${col}:${pgType}, ...))`

The cache table stores `analysis` as JSONB, plus `model`,
`prompt_tokens`, `completion_tokens`, `total_tokens`, `finished_at`.
Lookup is O(1) by `(user_id, connection_id, schema_fingerprint)`
(unique compound index).

Cache invalidation:
- Automatic when the schema fingerprint changes (a new schema_fp →
  cache miss → fresh analysis).
- Manual: user clicks "Re-analyze schema" on `/settings/ai`; we
  `DELETE FROM schema_analysis WHERE ...` then call analyze.

## 5. Preset boundary

Presets are pure React components keyed on `(table, analysis,
connectionId)`. They consume the existing data hooks (`useRows`,
`useInsertRow`, etc.) and the existing primitives (DataGrid, RowForm,
RowDrawer). They do not add a parallel data layer.

`pickPreset(table, analysis)` is the single dispatch:

```ts
function pickPreset(t: Table, a: TableAnalysis | undefined): PresetId {
  if (a?.category === "users") return "users";
  if (a?.category === "content") return "content";
  if (a?.category === "logs") return "logs";
  return "generic";
}
```

The per-table page lazy-loads the preset component:

```ts
const presetMap = {
  users: dynamic(() => import("@/components/presets/UsersAdmin")),
  content: dynamic(() => import("@/components/presets/ContentAdmin")),
  logs: dynamic(() => import("@/components/presets/LogsAdmin")),
  generic: dynamic(() => import("@/components/presets/GenericAdmin")),
};
```

## 6. Cost transparency

Every analysis call returns `usage.prompt_tokens` /
`usage.completion_tokens` from OpenRouter. We persist these on the
`schema_analysis` row so the user can see them in `/settings/ai`.

We do NOT estimate cost in $: pricing varies by model and changes
frequently; tokens are the honest unit.

## 7. Rate limiting

In-memory token bucket per-user (same module as the proxy write
limiter):
- AI analyses: 10 per hour per user.
- Cache reads: unlimited.

A v2 deploy on multi-instance hosting will replace the in-memory
limiter with Upstash Ratelimit (already documented in v0.2 research).

## 8. Redaction additions

The shared `redact()` helper gains two more patterns:
- `sk-or-[A-Za-z0-9-]{20,}`: OpenRouter keys
- `sk-[A-Za-z0-9-]{20,}`: generic provider keys (OpenAI / Anthropic
  shape, safety net)

Both are tested by writing the pattern at the top of a thrown error
and asserting the message that bubbles to the user no longer matches.
