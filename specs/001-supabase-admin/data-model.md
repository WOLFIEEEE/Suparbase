# Phase 1: Data Model

All runtime data falls into three buckets:

1. **Connection state**: persisted in `sessionStorage` or `localStorage`.
2. **Schema metadata**: derived by introspecting the user's Supabase project;
   held only in memory (React Query cache) for the session.
3. **Row data**: the user's actual data; fetched on demand, cached briefly in
   React Query.

There is no first-party persistence. Source of truth for types: `src/lib/...`
modules; this document mirrors them.

## Connection

```ts
// src/lib/connection/store.ts
export interface Connection {
  url: string;          // e.g. "https://abcd.supabase.co"
  key: string;          // anon or service_role JWT
  role: KeyRole;        // decoded from the JWT
  connectedAt: number;  // Date.now()
  remember: boolean;
}

export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";
```

Persistence rules:
- `remember: true` → JSON in `localStorage["suparbase.connection"]`
- `remember: false` → JSON in `sessionStorage["suparbase.connection"]`
- `clear()` removes both.
- Load order: sessionStorage first, then localStorage.
- The role is recomputed on load (don't trust the stored value).

## Schema metadata

```ts
// src/lib/schema/types.ts

export type ColumnTypeCategory =
  | "string"
  | "text"        // string but expected long
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "json"
  | "enum"
  | "unknown";

export interface ForeignKey {
  table: string;        // target table name
  column: string;       // target column name
  schema?: string;      // defaults to "public"
}

export interface Column {
  name: string;
  pgType: string;         // raw type as reported by OpenAPI (e.g., "timestamp with time zone")
  category: ColumnTypeCategory;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isGenerated: boolean;   // identity / generated / default uses gen_random_uuid() / now()
  enumValues?: string[];  // present iff category === "enum"
  fk?: ForeignKey;
  comment?: string;
}

export type TableKind = "table" | "view";

export interface Table {
  schema: string;         // "public"
  name: string;
  kind: TableKind;
  columns: Column[];
  primaryKey: string[];   // column names making up the PK; empty for tables without PK
  labelColumn: string | null;  // human label column, picked by labelColumn.ts
}

export interface Schema {
  introspectedAt: number;
  hostname: string;
  tables: Table[];
}
```

Validation:
- `Table.primaryKey` may be empty; if so, the UI disables write actions and
  shows a warning.
- `labelColumn` is `null` when no candidate column exists; FK badges fall back
  to showing the raw PK value.
- `Column.isGenerated` triggers hide-in-create and read-only-in-edit.

## Row data

```ts
// src/lib/api/rows.ts
export type Row = Record<string, unknown>;

export interface ListParams {
  table: string;
  page: number;       // 1-indexed
  pageSize: 10 | 25 | 50 | 100;
  sort?: { column: string; direction: "asc" | "desc" };
  search?: string;    // applied across detected text-like columns
}

export interface ListResult {
  rows: Row[];
  totalCount: number | null;  // null when unavailable
  estimated: boolean;         // true when count is approximate
}
```

## URL state

| Route                       | Query params                                  |
|-----------------------------|-----------------------------------------------|
| `/`                         | none                                          |
| `/dashboard`                | none                                          |
| `/tables`                   | none                                          |
| `/tables/:name`             | `?page&size&sort&q`                           |
| `/tables/:name/new`         | none                                          |
| `/tables/:name/:pk`         | `?edit=1` to open in edit mode                |
| `/schema`                   | none                                          |
| `/settings`                 | none                                          |

The `:pk` segment is the URL-encoded primary key value (or, for composite
keys, `colA-valA__colB-valB`).

## Reference picker

For a foreign-key field, the picker queries the referenced table:

```ts
client
  .from(fk.table)
  .select(`${fk.column}, ${targetLabelColumn}`)
  .ilike(targetLabelColumn, `%${term}%`)
  .limit(20);
```

The result is mapped to `{ value: row[fk.column], label: row[targetLabelColumn] }`.

## React Query keys (for cache coherence)

```ts
[ "schema", connection.hostname ]                              // Schema
[ "rowCount", connection.hostname, tableName ]                 // number | null
[ "rows", connection.hostname, tableName, listParams ]         // ListResult
[ "row", connection.hostname, tableName, primaryKey ]          // Row
[ "fk", connection.hostname, fk.table, fk.column, term ]       // { value, label }[]
```

Invalidation rules:
- Insert / update / delete on table `T` → invalidate `rows` + `rowCount` for `T`.
- "Refresh schema" → invalidate everything under `[ "schema", host ]` and all
  table data.
