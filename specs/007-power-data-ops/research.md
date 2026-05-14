# Phase 0: Research

**Feature**: Power-User Data Ops (v0.7) · [spec.md](./spec.md) · [plan.md](./plan.md)

No NEEDS CLARIFICATION markers carried over from the spec. The decisions
below document trade-offs that surfaced while designing the
implementation, so future contributors can follow why each surface is
shaped the way it is.

## Decision 1: Bulk operations use PostgREST `in.()`, not a custom endpoint

**Decision**: bulk delete and bulk update issue PostgREST requests with
`?pk_col=in.(id1,id2,...)` filters. The server-side helper at
`src/server/proxy/bulk.ts` chunks the primary-key set (max 500 ids per
chunk to stay under typical URL-length limits), issues one PostgREST
request per chunk under the existing `forward()` plumbing, and fans
audit rows out per affected primary key.

**Rationale**: PostgREST supports `in.()` filters natively, including on
composite primary keys (via `and(...)`). The proxy already streams
responses and verifies ownership. Building a custom bulk endpoint would
duplicate the auth+audit+stream layer and create a second code path to
secure. The chunked approach gives O(N/500) round-trips for N rows, well
within budget.

**Alternatives considered**:
- Single PATCH/DELETE per row in parallel. Rejected: 30 round-trips for
  30 rows is wasteful; the audit log volume is the same either way.
- A new SQL-level endpoint that lets the user execute arbitrary
  `DELETE WHERE id IN (...)`. Rejected: that's a SQL editor in disguise;
  belongs in v0.8 with its own security review.

## Decision 2: Audit log fans out one row per affected primary key

**Decision**: a bulk delete on 30 rows produces 30 `audit_log` rows,
identical in shape to 30 single-row deletes. No new `verb` value.

**Rationale**: the existing audit log shape is (user, connection, schema,
table, primary_key, verb, http_status, created_at). It already supports
this: one row per affected key is the right granularity for incident
response ("who deleted row X at 14:32?"). Introducing a new
"bulk_delete" verb would force every consumer to handle both shapes for
no compliance gain. The volume cost is negligible: 30 audit rows fit in
a 5-row pgbench transaction.

**Alternatives considered**:
- One audit row per batch with a JSONB `affected_keys` array. Rejected:
  changes the existing audit log shape, breaks the v0.6 Recent Activity
  panel that assumes one row per key, and complicates per-row drill-down.
- Skip auditing for bulk ops. Rejected: violates Principle V/VII.

## Decision 3: Undo for bulk delete re-INSERTs the row snapshots

**Decision**: before deleting, the server reads the full row snapshots
the request will affect. The response includes those snapshots. The
client undo-toast: same `sonner` pattern as v0.1: sends them back via
the existing `useInsertRow` hook on a 5-second window.

**Rationale**: matches the existing single-row undo UX exactly. The
snapshot cost (one extra SELECT before DELETE) is amortized over the
entire chunk and runs server-side so it doesn't block the user.

**Alternatives considered**:
- Use a soft-delete column. Rejected: requires schema changes on every
  user's table, which we explicitly don't do.
- No undo for bulk. Rejected: bulk delete is the highest-risk operation
  the app has now: undo is the safety net.

## Decision 4: CSV parser is hand-rolled (no `papaparse`)

**Decision**: `src/lib/csv/parse.ts` implements a small streaming CSV
parser as an async iterator over `string` chunks. Compatible with
RFC 4180 (quoted fields, embedded quotes via `""`, embedded newlines,
explicit delimiter: defaults to `,`). Total ~150 lines. Symmetric
serializer at `src/lib/csv/serialize.ts`.

**Rationale**: the constitution forbids new dependencies without
justification. `papaparse` is ~50 KB minified, used in two places
(import + export), and its streaming API isn't significantly nicer than
a hand-rolled one for our row shapes. We don't ship anywhere near 50 KB
of new code to replace it.

**Alternatives considered**:
- Adopt `papaparse`. Rejected per Technology Standards.
- Use the W3C [Streams CSV proposal](https://wicg.github.io/csv/). Rejected:
  experimental, not in stable browsers.

## Decision 5: Import goes through the existing per-row insert endpoint

**Decision**: the Import panel POSTs chunks of ≤500 rows to a thin new
helper at `POST /api/v/[id]/rest/[name]/import` that delegates to the
existing `insertRow` flow per row. Failure handling and audit rows reuse
the single-row path.

**Rationale**: the per-row path already handles type coercion,
ownership verification, redaction, and audit. Duplicating that into a
"bulk insert" endpoint would create a second insert code path with its
own bugs. Network overhead is amortized by chunking: one request body
carries 500 row payloads but only one auth+ownership check.

**Alternatives considered**:
- PostgREST bulk insert (`POST` with an array body). Rejected for v0.7:
  forces all rows to share a column set, which conflicts with our
  per-row "Skip bad rows" semantics. Could be added in a future
  optimisation pass once we measure how slow the per-row path actually is.

## Decision 6: Filter chip URL encoding mirrors PostgREST

**Decision**: filter chips serialize to URL params as
`filter=col.op.val` (one repeated `filter` parameter per chip). Format
exactly matches PostgREST's own filter syntax. Multiple chips combine
with AND because PostgREST does too.

**Rationale**: round-trip simplicity: the same string sent over the
wire to PostgREST is the canonical URL state. No client-side translation
layer needed for the simple cases. The `in.()` operator handles
comma-separated lists; null operators (`is.null`, `not.is.null`) carry
no value.

**Alternatives considered**:
- A custom URL DSL. Rejected: every developer who already knows
  PostgREST has to learn a second one for no gain.
- JSONB blob in a single `state` param. Rejected: URLs become opaque,
  hand-editing breaks, share-and-bookmark UX suffers.

## Decision 7: Inline cell editor uses optimistic react-query updates

**Decision**: the inline editor commits via `useUpdateRow.mutateAsync`
with an `onMutate` that optimistically updates the cached row + a
rollback on error. The cell's visual state (text → flash → final value)
is driven by mutation state, not by the network round-trip.

**Rationale**: keeps the perceived latency at ~zero for the common
case (the user moves to the next cell while the request is in flight).
Matches the existing react-query patterns the rest of the app uses.
Rollback on error is the safety net.

**Alternatives considered**:
- Synchronous commit (wait for server response before showing the new
  value). Rejected: visible latency on every keystroke, anti-pattern.
- A separate `optimistic` reducer outside react-query. Rejected: adds a
  parallel state machine we don't need.

## Decision 8: Saved-view state is a JSONB blob keyed by column-name strings

**Decision**: `saved_views.state` is a JSONB column holding
`{ search?, sort?, filters: ChipSpec[], hidden: string[] }`. Column
references are by name. Validation that the columns still exist happens
client-side at apply time, not at save time.

**Rationale**: the schema can drift independently of saved views: the
user could rename or drop a column the view references. We surface that
inconsistency at apply-time with a clear "this view references a column
that's been removed: repair or delete" prompt, rather than failing the
save or eagerly fixing the view on every schema introspection.

**Alternatives considered**:
- Resolve column references to OIDs at save time. Rejected: PostgreSQL
  OIDs aren't exposed through PostgREST, and we'd have to add an
  introspection step that doesn't currently exist.
- Auto-prune dropped columns from views at apply-time. Rejected: silent
  data loss; the explicit prompt is more honest.

## Decision 9: Selection state lives in React context, scoped per table page

**Decision**: a small `SelectionContext` provider, mounted at each
preset's list page, holds `{ selected: Set<string>, toggle, clear }`.
The keys are stable `encodePkSegment` strings: identical to what the
detail-page route uses. Pagination doesn't reset; route changes do.

**Rationale**: the selection needs to persist across pagination
clicks (Acceptance Scenario 1.4) but reset on page leave (Acceptance
Scenario 1.4 + Edge Case "refresh page"). React context with no
persistence layer is the simplest model.

**Alternatives considered**:
- URL-backed selection state. Rejected: 200-row PKs would balloon the
  URL; bookmarkability of selection isn't a requested feature.
- Zustand or another state store. Rejected: would be the first new
  dependency, against the spec.

## Decision 10: Bulk update validates each (column, value) on the client first

**Decision**: the BulkUpdatePanel runs the same `coerceForWrite` step
the single-row form already uses, against the selected columns + their
new values, before the request leaves the browser. Type / null /
generated-column violations surface inline; the submit button only
enables when every (column, value) pair is valid.

**Rationale**: catches the most common errors before consuming the
tight bulk-mutation rate limit (5/min). Server-side validation still
runs as the last word; the client check is for UX.

**Alternatives considered**:
- Server-side only validation. Rejected: each retry costs a precious
  bucket token.

---

All decisions resolved. No outstanding NEEDS CLARIFICATION.
