# SQL playground (v1.4)

## Goal
Run arbitrary SQL against the user&apos;s project from inside the
workspace. Read-only by default; explicit toggle to enable writes.

## Server
- `src/server/proxy/sql-playground.ts` — `executeSql({conn, sql,
  readOnly, statementTimeoutMs})`:
  - Opens a one-shot `postgres` connection using the encrypted Postgres
    URL (same column as the RLS debugger, `encryptedPostgresUrl`).
  - Always runs inside a transaction.
    - read-only: `BEGIN; SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = N; <sql>; ROLLBACK` — Postgres rejects any write itself, and the rollback is belt-and-braces.
    - write: `BEGIN; SET LOCAL statement_timeout = N; <sql>; COMMIT`.
  - Caps result set at `ROW_CAP = 1000` rows; serialises each cell with
    a 2 KB character cap; renders bytea as `\\xHEX` or
    `<N bytes>` when over 32 bytes; dates as ISO.
  - Maps known Postgres error codes to friendly categories:
    `25006` → "read-only mode is on" (`rls`),
    `57014` → "statement timed out" (`server`),
    `42501` → policy violation (`rls`),
    `4xxxx / 43xxx` → `validation`.

## API
`POST /api/v/[id]/sql/execute` accepts
`{sql, readOnly?: boolean = true, statementTimeoutMs?: number = 5000}`.

- Returns `{columns: {name, typeOid}[], rows: unknown[][], rowCount,
  truncated, elapsedMs, command, notices, readOnly}`.
- Read-only queries burn read-rate tokens; write queries burn the
  same `checkWriteRate` bucket as PostgREST writes.
- Write-mode queries record a single `audit_log` entry with the SQL
  text stored in `afterRow.sql` (visible from the existing recent-
  activity feed and row history panel).

## UX
- New sidebar entry `SQL` (between Schema and Storage).
- Page at `/c/[id]/sql`. If no Postgres URL is configured, shows a
  prompt linking to the RLS page (the same place where it&apos;s
  added).
- Toolbar:
  - Read-only / Write mode toggle. Switching to write mode requires a
    `window.confirm` click — friction by design.
  - Statement timeout selector (1s / 5s / 15s / 30s / 60s).
  - EXPLAIN button: prefixes the current query with
    `EXPLAIN ANALYZE` and runs it.
  - Recent dropdown reading the last 30 queries from
    `localStorage["suparbase.sql.history.<connId>"]`.
  - Run / Cancel button. `Cmd/Ctrl + Enter` keyboard shortcut.
- Plain `<textarea>` editor (monospace, Tab inserts two spaces). No
  CodeMirror — keeps bundle size flat.
- Result panel shows:
  - Mode badge (`read-only` or `write`),
  - Command tag (`SELECT`, `UPDATE 4`, …),
  - Row count + truncation note + elapsed ms,
  - Sticky-header table with column name + Postgres type below it
    (mapped via a small OID lookup),
  - NULL rendered as italic, booleans coloured, long strings
    collapsible.
- Error panel renders category + message + `detail` + `hint` +
  `position` straight from Postgres.

## Safety
- Banner on top makes the active mode explicit:
  - Read-only: accent-coloured, mentions `SET TRANSACTION READ ONLY`.
  - Write: danger-coloured, names the role and warns about
    `DROP TABLE` etc.
- Server enforces both the read-only transaction wrapper and the
  statement timeout — the UI&apos;s mode toggle is just a hint to
  the server, which is the real gate.

## Out of scope (v1.4)
- Multi-statement scripts (we&apos;re using `.unsafe(sql)`, which only
  returns the result of the last statement when multiple are
  separated by `;`).
- CodeMirror / syntax highlighting / autocomplete from the schema.
- Saving queries by name on the server.
- Streaming large result sets.
- AI chat &harr; SQL bridge ("convert this question to SQL, then run").
