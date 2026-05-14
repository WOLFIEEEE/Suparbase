# Contract: Data Access

All row CRUD funnels through `src/lib/api/`. Views import React Query hooks
from `src/lib/api/hooks.ts`; those hooks call into the typed helpers below.
No view component talks to `supabase-js` directly.

## Helpers

```ts
// src/lib/api/rows.ts
export async function listRows(
  client: SupabaseClient,
  table: Table,
  params: ListParams,
): Promise<ListResult>;

export async function getRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
): Promise<Row>;

export async function insertRow(
  client: SupabaseClient,
  table: Table,
  values: Row,
): Promise<Row>;

export async function updateRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
  patch: Partial<Row>,
): Promise<Row>;

export async function deleteRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
): Promise<void>;

export type PrimaryKeyValue = Record<string, unknown>;
```

### listRows behavior

- Selects `*`.
- `range(from, to)` where `from = (page-1) * pageSize`, `to = from + pageSize - 1`.
- `order(sort.column, { ascending: sort.direction === "asc" })` when `sort`.
- Search: `or(textColumns.map(c => `${c}.ilike.%${term}%`).join(','))` where
  `textColumns` is the list of columns whose `category` is `string` or
  `text`, capped at 8 columns by introspected order. Skips when `search` is
  empty.
- Count: requests `count: 'exact'`. Returns `{ rows, totalCount, estimated: false }`.
- On count timeout (>3s) or on tables larger than the count threshold,
  re-issues with `count: 'estimated'` and sets `estimated: true`.

### insertRow / updateRow behavior

- Strips columns where `isGenerated: true` AND the value is `null` /
  `undefined` (we never pass auto-managed empties).
- For `category === "json"` columns: parses the value from the form's string
  if not already an object.
- For `category === "datetime"` columns: converts ISO strings to the format
  Postgres accepts (passes through; supabase-js handles serialization).
- Sets `Prefer: return=representation`; returns the saved row.

### deleteRow behavior

- Targets by all PK columns (composite-key safe).
- Before deletion, the calling hook reads the row to enable undo (the hook
  layer concern; `deleteRow` only deletes).

## Counts (dashboard tiles)

```ts
// src/lib/api/count.ts
export async function countRows(
  client: SupabaseClient,
  table: string,
): Promise<{ count: number | null; estimated: boolean }>;
```

Uses `select('*', { count: 'estimated', head: true })`. Estimated is fine for
the dashboard: exact counts on large tables are expensive.

## Reference picker

```ts
// src/lib/api/reference.ts
export async function searchReferences(
  client: SupabaseClient,
  fk: ForeignKey,
  labelColumn: string,
  term: string,
): Promise<Array<{ value: unknown; label: string }>>;
```

Limit 20 results; debounced by the caller (300ms).

## React Query hooks (consumer-facing)

```ts
// src/lib/api/hooks.ts
export function useSchema(): UseQueryResult<Schema>;
export function useRowCount(tableName: string): UseQueryResult<number | null>;
export function useRows(table: Table, params: ListParams): UseQueryResult<ListResult>;
export function useRow(table: Table, pk: PrimaryKeyValue): UseQueryResult<Row>;
export function useInsertRow(table: Table): UseMutationResult<Row, AppError, Row>;
export function useUpdateRow(table: Table): UseMutationResult<Row, AppError, { pk: PrimaryKeyValue; patch: Row }>;
export function useDeleteRow(table: Table): UseMutationResult<void, AppError, PrimaryKeyValue>;
```

Mutation success → invalidate `["rows", host, table.name]` and
`["rowCount", host, table.name]`.

## Errors

```ts
// src/lib/api/errors.ts
export type ErrorCategory =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "constraint"
  | "rate_limited"
  | "server"
  | "client_bug";

export class AppError extends Error {
  category: ErrorCategory;
  columnHint?: string;
  cause?: unknown;
}

export function toAppError(input: unknown): AppError;
```

Mapping rules:
- `PostgrestError.code` starting with `23` → `"constraint"`. We parse `details`
  for `Key (column)=...` to set `columnHint`.
- `PostgrestError.code === "PGRST301"` → `"unauthorized"` (JWT issues).
- HTTP 401 → `"unauthorized"`; 403 → `"forbidden"`; 404 → `"not_found"`;
  409 → `"constraint"`; 429 → `"rate_limited"`; 5xx → `"server"`.
- `TypeError` / `AbortError` from fetch → `"network"`.

API keys MUST NOT appear in `AppError.message`. The mapper strips them
defensively from any `cause.message` it constructs.
