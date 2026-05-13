# Contract — Preset framework

## Preset id

```ts
export type PresetId = "users" | "content" | "logs" | "generic";
```

## Selector

```ts
// src/lib/presets/pick.ts
export function pickPreset(
  table: Table,
  analysis: TableAnalysis | undefined,
  override: PresetId | null = null,
): PresetId
```

Resolution:
1. If `override` is non-null, return it.
2. If `analysis` matches a non-generic category, return it.
3. Else run the deterministic heuristic from `heuristic.ts` and return
   the result.

## Heuristic

```ts
// src/lib/presets/heuristic.ts
export function heuristicCategory(table: Table): PresetId
```

Pure function, no I/O. Returns `users | content | logs | generic`.

## Preset components

Every preset has the signature:

```ts
interface PresetProps {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
}
```

Each preset returns a full page body. The outer page wrapper (breadcrumb,
header, "Switch to generic view" link) lives on the route, not in the
preset.

## Lazy-load

```ts
// src/app/(auth)/c/[id]/tables/[name]/page.tsx (excerpt)
const presetMap = {
  users:   dynamic(() => import("@/components/presets/UsersAdmin")),
  content: dynamic(() => import("@/components/presets/ContentAdmin")),
  logs:    dynamic(() => import("@/components/presets/LogsAdmin")),
  generic: dynamic(() => import("@/components/presets/GenericAdmin")),
};
```

The page resolves the preset id, then renders `<Preset {...props} />`.

## Override semantics

A `?view=generic` query parameter forces GenericAdmin for that page
load. The PresetSwitcher component toggles the parameter via
`useRouter().replace(...)`.

## Required from each preset

- Renders within the existing `(auth)/c/[id]/...` layout (no new
  chrome).
- Uses `useRows`, `useRow`, `useInsertRow`, `useUpdateRow`,
  `useDeleteRow` from `src/lib/api/hooks.ts`.
- Falls back gracefully to generic behaviour when the analysis is
  imperfect (e.g. UsersAdmin must still render a usable list when no
  email column exists).
- Has a unique, AI-themed accent (the existing phosphor-green is
  reused; presets do not introduce new accent colors).
