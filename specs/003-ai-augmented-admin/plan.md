# Implementation Plan: AI-augmented admin presets

**Branch**: `003-ai-augmented-admin` | **Date**: 2026-05-13

## Summary

Add a thin AI layer on top of v0.2. Users supply an OpenRouter API key
which we vault. On first access to a connection (or on demand), we
send the introspected schema metadata to an LLM and receive a JSON
classification: per-table category + display name + suggested list
columns. The classification is cached per schema fingerprint and used
to route each table to one of four prebuilt admin presets
(UsersAdmin, ContentAdmin, LogsAdmin, GenericAdmin).

## Technical Context

**New deps**: none. We call OpenRouter's OpenAI-compatible Chat
Completions endpoint via `fetch`.

**New env**: none required server-side; users provide their own keys.
Optional: `SUPARBASE_AI_DEFAULT_MODEL` overrides the default model.

**New DB tables** (added to existing migration via a follow-up
migration file):
- `user_settings` — owner of the encrypted OpenRouter key + default
  model + most-recent usage metrics.
- `schema_analysis` — cache keyed by `(user_id, connection_id,
  schema_fingerprint)`.

**Performance**:
- Cache lookups bypass the LLM entirely.
- Presets are lazy-loaded so a no-AI session does not load preset JS.
- Bundle delta budget: ≤ 30 KB gz per first paint.

## Constitution Check (v3.1.0)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Cached analysis; lazy preset chunks. |
| IV. Accessibility | PASS | Each preset reuses our Radix-backed primitives. |
| V. Vault & Proxy | PASS | OpenRouter key is vaulted server-side; LLM calls run server-side. |
| VI. Clean Code | PASS | `src/server/ai/` is server-only; presets in `src/components/presets/`; pure `pickPreset()` selector. |
| VII. Data & Security | PASS | Redactor recognizes `sk-or-*`; LLM only sees metadata; Zod validation of LLM responses. |
| IX. AI Assistance | PASS | Cost transparency in Settings; opt-in; graceful fallback. |

## Project Structure (delta)

```text
src/server/
├── schema/
│   ├── user-settings.ts          # NEW table
│   └── schema-analysis.ts        # NEW table
├── crypto/
│   └── vault.ts                  # unchanged — already generic over plaintext
├── ai/
│   ├── openrouter.ts             # NEW — fetch wrapper
│   ├── prompt.ts                 # NEW — schema → prompt
│   ├── responseSchema.ts         # NEW — Zod schemas for LLM JSON
│   ├── analyze.ts                # NEW — orchestrator: cache → call → validate → cache
│   └── fingerprint.ts            # NEW — schema fingerprint
└── settings/
    └── repo.ts                   # NEW — user_settings CRUD

src/app/
├── api/
│   ├── settings/ai/route.ts      # NEW — GET / PUT / DELETE
│   └── ai/
│       └── analyze/[id]/route.ts # NEW — POST (run / re-run); GET (cached)
└── (auth)/
    ├── settings/                 # NEW global settings area
    │   ├── layout.tsx
    │   └── ai/page.tsx
    └── c/[id]/
        └── tables/[name]/page.tsx # WIRED — picks preset

src/components/
├── presets/                      # NEW
│   ├── UsersAdmin.tsx
│   ├── ContentAdmin.tsx
│   ├── LogsAdmin.tsx
│   └── shared/                   # cross-preset bits (StatusPill, etc.)
└── workspace/
    ├── PresetSwitcher.tsx        # NEW — "Switch to generic view"
    └── TableTile.tsx             # WIRED — category badge

src/lib/
├── presets/
│   ├── pick.ts                   # NEW — pickPreset(table, analysis)
│   └── types.ts                  # NEW — TableAnalysis interface
└── types/
    └── analysis.ts               # NEW — shared analysis shape
```

## Complexity Tracking

| Decision | Why | Simpler alternative rejected because |
|----------|-----|---------------------------------------|
| OpenRouter-only (no native OpenAI/Anthropic) | Single integration; user already manages cost via OpenRouter. | Multi-provider matrix doubles surface area for v1. |
| Heuristic fallback for category | If AI is unavailable, we still classify by simple name+column heuristics, so presets work without an LLM. | "Just use generic" is acceptable but a 20-line heuristic recovers most of the value for free. |
| Lazy-load presets via `next/dynamic` | Keeps the no-AI codepath fast. | Bundling all presets up front violates the ≤ 30 KB budget. |
