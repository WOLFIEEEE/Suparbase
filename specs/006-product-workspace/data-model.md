# Phase 1 — Data Model

**Feature**: Product Workspace (v0.6) · [spec.md](./spec.md) · [plan.md](./plan.md)

This release introduces **no new database tables, no new columns, and no new migrations**. It reads existing data and adds one client-side concept (theme preference). The model below documents the types each surface depends on, sourced from the canonical files under `src/lib/types/`.

## 1. Inputs read by this feature

### 1.1 Connection (existing, unchanged)

Source: `src/lib/types/connection.ts`

The Dashboard header and Topbar already render the connection summary; v0.6 simply makes more of it visible.

```ts
interface ConnectionSummary {
  id: string;
  name: string;        // "my-staging" — now the Dashboard page title
  hostname: string;    // "abc.supabase.co" — demoted to subtitle
  role: "anon" | "authenticated" | "service_role" | "unknown";
  createdAt: string;
}
```

Fields used by v0.6: `id`, `name`, `hostname`, `role`. No additions.

### 1.2 Schema + Table (existing, unchanged)

Source: `src/lib/types/schema.ts`

```ts
interface Schema {
  introspectedAt: number;
  hostname: string;
  tables: Table[];
}

interface Table {
  schema: string;
  name: string;
  kind: "table" | "view";
  columns: Column[];
  primaryKey: string[];
  labelColumn: string | null;
}
```

The Tables list groups `schema.tables` by archetype. The "System tables" disclosure filters on `t.schema === "auth"` or `t.schema === "storage"`.

### 1.3 TableAnalysis (existing, extended in v0.5.1)

Source: `src/lib/types/analysis.ts`

```ts
type TableCategory = "users" | "content" | "logs" | "generic";

interface TableAnalysis {
  schema: string;
  name: string;
  category: TableCategory;
  displayName: string;
  listColumns: string[];
  statusColumn?: string | null;
  titleColumn?: string | null;
  notes?: string;

  // Added in v0.5.1 — load-bearing for v0.6:
  primary?: TableAnalysisPrimary;       // titleColumn, subtitleColumn, avatarColumn, badgeColumn
  hiddenColumns?: string[];             // password_hash, encrypted_*, jsonb meta, etc.
  relations?: TableAnalysisRelation[];  // FK columns w/ label and showOnDetail
}
```

Every archetype-aware surface in v0.6 (Dashboard sections, Tables list groups, ContentAdmin row cards, LogsAdmin actor badges, ContentDetail / LogDetail hero blocks) reads `category`, `displayName`, `primary`, `hiddenColumns`, and `relations`. When the AI cache is absent the same shape comes from `heuristicAnalysisFor` in `src/lib/presets/heuristic.ts`.

### 1.4 Audit log row (existing, unchanged)

Source: `src/server/schema/audit.ts` (Drizzle table `audit_log`).

```ts
interface AuditRow {
  id: string;
  userId: string;
  connectionId: string;
  tableSchema: string;
  tableName: string;
  verb: "insert" | "update" | "delete";
  primaryKey: Record<string, unknown> | null;
  createdAt: Date;
}
```

The Dashboard's recent-activity panel renders the latest 10 rows scoped to `(userId, connectionId)`, mapped through `relativeFromNow` for the time-ago label.

### 1.5 AI settings summary (existing, unchanged)

Source: `src/lib/types/analysis.ts`

```ts
interface AiSettingsSummary {
  hasKey: boolean;
  defaultModel: string;
  lastAnalysisModel: string | null;
  lastAnalysisAt: string | null;
  lastPromptTokens: number | null;
  lastCompletionTokens: number | null;
  lastTotalTokens: number | null;
}
```

The sidebar AI-assistance footer reads `lastAnalysisModel` and `lastTotalTokens` to populate its subtitle (FR-S03).

## 2. New concept — Theme preference

This is a client-side preference, not a database entity.

### 2.1 Type

To live at `src/lib/theme/types.ts`:

```ts
export type Theme = "light" | "dark" | "system";
```

### 2.2 Storage

A single HTTP cookie:

| Field         | Value                              |
|---------------|------------------------------------|
| Name          | `suparbase-theme`                  |
| Value         | `"light"` \| `"dark"` \| `"system"` |
| Path          | `/`                                |
| `SameSite`    | `Lax`                              |
| `Secure`      | Set in production                  |
| `HttpOnly`    | **false** (client toggle writes it)|
| Max-Age       | 1 year                             |
| Default       | absent → treated as `"system"`     |

Rationale captured in [research.md Decision 5](./research.md).

### 2.3 Lifecycle

1. **First render (server)**: `app/layout.tsx` reads `cookies().get("suparbase-theme")`. If `"light"` or `"dark"`, set `<html data-theme={value}>`. If absent or `"system"`, leave the attribute off (CSS variables already provide `prefers-color-scheme` defaults).
2. **Toggle (client)**: `ThemeToggle` button updates `document.documentElement.dataset.theme` optimistically and writes the cookie via `document.cookie`.
3. **Subsequent navigation**: each SSR request reads the cookie again — there is no flash.

### 2.4 State transitions

```
[absent]  ──toggle──▶  "dark"  ──toggle──▶  "light"  ──toggle──▶  "dark"  ...
   ▲                                                                │
   └────────────── user manually clears cookie ────────────────────┘
```

`"system"` is a valid value but not reachable from the toggle UI in v0.6 (always toggles between concrete `"light"` and `"dark"`). It exists as a future extension and as the implicit default when the cookie is absent.

## 3. Command palette index (in-memory, ephemeral)

A client-side aggregate, not persisted. Computed lazily on first palette open.

```ts
interface PaletteEntry {
  kind: "connection" | "table" | "settings" | "action";
  id: string;          // stable identifier for cmdk
  label: string;       // primary string the user reads
  hint?: string;       // secondary line (e.g. "in my-staging")
  href?: string;       // for navigable entries
  run?: () => void;    // for action entries (toggle theme, sign out)
  iconName?: string;   // lucide name from a small whitelist
}
```

Sources:
- `kind: "connection"` — from the existing `useConnections()` hook.
- `kind: "table"` — from the active connection's `useSchema()` result, each row decorated with the AI display name from the matching `TableAnalysis`.
- `kind: "settings"` — static list: AI assistance, Connection settings, Account.
- `kind: "action"` — static list: New connection, Run AI analysis (only if user has an OpenRouter key), Toggle theme, Sign out.

The component never persists this list; closing the palette drops it from local state. Re-opening recomputes from the (typically warm) react-query cache.

## 4. Relationships diagram

```
┌─────────────────┐         reads          ┌──────────────────────┐
│ Dashboard       │ ─────────────────────▶ │ Schema (existing)    │
│ TablesList      │                        │ TableAnalysis (v0.5.1)│
│ ContentAdmin v2 │                        │ Connection (existing) │
│ LogsAdmin v2    │                        └──────────────────────┘
│ ContentDetail   │
│ LogDetail       │ ─────────────────────▶ ┌──────────────────────┐
└─────────────────┘         reads          │ audit_log rows       │
                                           │ (existing, scoped to │
                                           │  connection+user)    │
                                           └──────────────────────┘

┌─────────────────┐  reads cookie  ┌─────────────────┐
│ app/layout.tsx  │ ─────────────▶ │ suparbase-theme │
│ ThemeToggle     │  writes cookie │ (HTTP cookie)   │
└─────────────────┘                └─────────────────┘

┌─────────────────┐    aggregates  ┌──────────────────────┐
│ CommandPalette  │ ─────────────▶ │ useConnections()     │
└─────────────────┘                │ useSchema(activeId)  │
                                   │ useAnalysis(activeId)│
                                   └──────────────────────┘
```

No new persistence. No new tables. No drizzle changes.
