# Phase 1 — Data Model (delta from v0.2)

## New tables

### `user_settings`

```ts
{
  userId               uuid pk fk users.id on delete cascade
  encryptedOpenrouterKey bytea | null
  defaultModel         text not null default 'anthropic/claude-3.5-haiku'
  lastAnalysisModel    text | null
  lastAnalysisAt       timestamptz | null
  lastPromptTokens     integer | null
  lastCompletionTokens integer | null
  lastTotalTokens      integer | null
  updatedAt            timestamptz default now()
}
```

One row per user (PK is the user id).

### `schema_analysis`

```ts
{
  id                 uuid pk default gen_random_uuid()
  userId             uuid fk users.id on delete cascade
  connectionId       uuid fk connections.id on delete cascade
  schemaFingerprint  text not null      // sha256 hex
  analysis           jsonb not null     // TableAnalysis[] (validated)
  model              text not null
  promptTokens       integer not null
  completionTokens   integer not null
  totalTokens        integer not null
  source             text not null      // 'ai' | 'heuristic'
  createdAt          timestamptz default now()

  unique (userId, connectionId, schemaFingerprint)
  index (connectionId)
}
```

`source = 'heuristic'` rows have zeroes in the token columns — they
encode that the cached classification did not consume LLM credit.

## Shared domain types

```ts
// src/lib/types/analysis.ts
export type TableCategory = "users" | "content" | "logs" | "generic";

export interface TableAnalysis {
  schema: string;
  name: string;
  category: TableCategory;
  displayName: string;
  listColumns: string[];        // ≤ 6 columns recommended for list view
  statusColumn?: string | null; // e.g. "status" for ContentAdmin
  titleColumn?: string | null;  // e.g. "title" for ContentAdmin
  notes?: string;               // short reason for the classification
}

export interface SchemaAnalysisResult {
  fingerprint: string;
  source: "ai" | "heuristic";
  model: string;
  tables: TableAnalysis[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishedAt: string;           // ISO timestamp
}
```

## API surfaces

```ts
// GET  /api/settings/ai             → AiSettingsSummary  (key never returned)
// PUT  /api/settings/ai             body { key?: string; defaultModel?: string }
// DELETE /api/settings/ai           clears the key

// GET  /api/ai/analyze/:connectionId → SchemaAnalysisResult | { state: "not_cached" }
// POST /api/ai/analyze/:connectionId → SchemaAnalysisResult  (runs the LLM; rate-limited)
```

`AiSettingsSummary`:

```ts
interface AiSettingsSummary {
  hasKey: boolean;
  defaultModel: string;
  lastAnalysisModel: string | null;
  lastAnalysisAt: string | null;     // ISO
  lastPromptTokens: number | null;
  lastCompletionTokens: number | null;
  lastTotalTokens: number | null;
}
```

## React Query keys (additions)

```ts
[ "settings", "ai" ]                                 // AiSettingsSummary
[ "analysis", connectionId ]                         // SchemaAnalysisResult | null
[ "preset", connectionId, tableName ]                // resolved PresetId
```

## State

Server is authoritative. Client cache: React Query. The OpenRouter key
NEVER lives in browser state — `hasKey` is a boolean derived
server-side.
