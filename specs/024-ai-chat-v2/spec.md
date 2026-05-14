# AI chat v2.0 — persistent multi-conversation + richer toolbelt

## Goal
The v1 chat was a one-shot, single-conversation drawer with three
read-only tools. v2 turns it into a place you keep coming back to:
conversations are saved per connection, the agent knows what page
you're on, it has more ways to introspect the database, and answers
render proper markdown.

## What ships

### 1. Persistent multi-conversation memory
- Per-connection localStorage (`suparbase.chat.<connId>.v2.conversations`).
- Up to 50 conversations kept, oldest evicted.
- Sidebar list with new / switch / delete / export-as-markdown.
- Auto-title from the first user message.
- Cumulative token totals shown per conversation.

### 2. Three new agent tools
| Tool | Purpose |
| --- | --- |
| `aggregate` | `count` / `sum` / `avg` / `min` / `max` on a column, optional `group_by` and `filters`. PostgREST-backed, read-only. |
| `list_indexes` | Lists indexes for a table (name, definition, primary/unique flag) via `pg_indexes`. Helps the agent answer perf questions. |
| `audit_summary` | Reads `audit_log` (scoped to the current user + connection) and returns counts grouped by action + table, with a time window. |

All three are wired through the same dispatch + validation path as the
existing tools and only operate inside the user's scope.

### 3. Page-context awareness
- Client detects `/c/<id>/tables/<name>[/...]` via `usePathname()`.
- Sends `{ pathname, tableName, view }` in the chat request body.
- System prompt gets a one-line context hint so "this table" works.

### 4. Markdown rendering for answers
- Inline `**bold**`, `` `code` ``, `[links](href)`.
- Fenced ```code blocks``` get a copy button.
- Bullet lists and paragraphs.
- Hand-written renderer (no `react-markdown`) — trusted server-side
  text, kept tiny.

### 5. Copy / export / token totals
- Per-message copy button on hover.
- Per-conversation Export-as-markdown.
- Header shows the active conversation's cumulative token count.
- Each assistant turn shows its own per-turn token count.

## What didn't change
- The read-only-by-default contract: write tools still produce
  `proposed_*` results and require an explicit Apply.
- The NDJSON streaming wire format (phase / tool_start / tool_end /
  text / done / error) — additive `usage` payload was already there.
- Rate limit, OpenRouter key handling, schema introspection, cached
  analysis fallback.

## End-state
v2.0 = drop-in upgrade. Existing v1 conversations are simply not
visible (different localStorage key) and a fresh New conversation is
created on first open per connection.
