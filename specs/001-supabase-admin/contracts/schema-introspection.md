# Contract — Schema Introspection

## Source endpoint

```
GET ${SUPABASE_URL}/rest/v1/
Headers:
  apikey: <key>
  Authorization: Bearer <key>
  Accept: application/openapi+json
```

Response is a Swagger 2.0 document. We only consume:

- `host`, `basePath`
- `definitions` (object keyed by table/view name)
- `paths` (used to detect table vs view)

## Parser contract

```ts
// src/lib/schema/introspect.ts
export async function introspect(conn: Connection): Promise<Schema>;
```

Steps:

1. Fetch OpenAPI doc; throw `AppError("network" | "unauthorized" | ...)` on
   non-2xx.
2. For each key `t` in `definitions`:
   - Determine `kind`: if `paths["/" + t]` has `post`, `patch`, or `delete`
     methods → `"table"`; else `"view"`.
   - Build `Column[]` from `definitions[t].properties`:
     - `name` = property key
     - `pgType` = property `format` if present, else `type`
     - `category` = `typeMap(pgType, property)`
     - `nullable` = NOT in `definitions[t].required`
     - `defaultValue` = property `default` ?? null
     - `isPrimaryKey` = property `description` contains `<pk/>` token
     - `isGenerated` = `defaultValue` matches one of `gen_random_uuid()`,
       `now()`, `nextval(...)`, or property `description` contains
       `<gen/>`
     - `enumValues` = property `enum` if present
     - `fk` = parsed from property `description` if present (see fkParser)
     - `comment` = strip PostgREST tags from description, trim
   - `primaryKey` = column names with `isPrimaryKey: true`
   - `labelColumn` = `labelColumn(columns)`
3. Sort tables alphabetically; sort columns by original OpenAPI order.

## Type-category mapping

```ts
// src/lib/schema/typeMap.ts
function typeMap(pgType: string, prop: OpenAPIProperty): ColumnTypeCategory {
  if (prop.enum) return "enum";
  switch (pgType) {
    case "uuid": return "uuid";
    case "boolean": return "boolean";
    case "smallint": case "integer": case "bigint":
    case "int2": case "int4": case "int8": return "integer";
    case "real": case "double precision": case "numeric":
    case "float4": case "float8": return "float";
    case "date": return "date";
    case "timestamp without time zone":
    case "timestamp with time zone":
    case "timestamptz": return "datetime";
    case "json": case "jsonb": return "json";
    case "text": return "text";
    case "character varying": case "varchar": return "string";
    default: return "unknown";
  }
}
```

## Foreign-key parser

```ts
// src/lib/schema/fkParser.ts
export function parseFk(description: string | undefined): ForeignKey | undefined;
```

Recognized patterns (in order):

1. `<fk table='X' column='Y'/>` (PostgREST 12+ machine-readable)
2. ``This is a Foreign Key to `public.X.Y` `` (regex fallback)
3. ``This is a Foreign Key to `X.Y` `` (regex fallback, schema defaulted)

If none match, `undefined`.

## Label-column picker

```ts
// src/lib/schema/labelColumn.ts
const PRIORITY = [
  "name", "title", "display_name", "displayname",
  "label", "email", "username", "handle", "slug",
];
```

Pick the first matching column (case-insensitive) whose `category` is
`string`/`text`. If none, fall back to the single-column PK if it is
`string`/`text`/`uuid`. If still none, `null`.

## Round-trip example

For a typical Supabase table:

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  author_id uuid references public.users(id),
  published_at timestamptz default now()
);
```

→ produces:

```ts
{
  schema: "public",
  name: "posts",
  kind: "table",
  primaryKey: ["id"],
  labelColumn: "title",
  columns: [
    { name: "id", pgType: "uuid", category: "uuid",
      nullable: false, defaultValue: "gen_random_uuid()",
      isPrimaryKey: true, isGenerated: true },
    { name: "title", pgType: "text", category: "text",
      nullable: false, defaultValue: null,
      isPrimaryKey: false, isGenerated: false },
    { name: "body", pgType: "text", category: "text",
      nullable: true, defaultValue: null,
      isPrimaryKey: false, isGenerated: false },
    { name: "author_id", pgType: "uuid", category: "uuid",
      nullable: true, defaultValue: null,
      isPrimaryKey: false, isGenerated: false,
      fk: { schema: "public", table: "users", column: "id" } },
    { name: "published_at", pgType: "timestamp with time zone",
      category: "datetime", nullable: true, defaultValue: "now()",
      isPrimaryKey: false, isGenerated: true },
  ],
}
```
