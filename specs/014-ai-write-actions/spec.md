# AI write actions with diff preview (v1.2)

## Goal
Let the chat assistant draft INSERT / UPDATE / DELETE statements from
natural language, but require an explicit user click in the UI before
any write is committed.

## Server tools
Three new tools added to the agent loop. None of them execute writes;
they only build a proposal payload.

- `propose_update({table_name, summary, filters, patch})` —
  pre-validates the patch column names, then fetches up to 5 affected
  rows via PostgREST SELECT (with `count=exact`) so the UI can show a
  before/after diff and the affected-row count.
- `propose_insert({table_name, summary, values})` —
  validates column names against the schema.
- `propose_delete({table_name, summary, filters})` —
  pre-fetches the affected rows preview.

The tool result is a `{kind: "proposed_*", ...}` object that the
chat-stream emits to the client inside `tool_end`. The client detects
the shape via `toProposal()` and renders a ProposalCard inline.

## Execute endpoint
`POST /api/ai/chat/[id]/execute` accepts the proposal payload (zod
`discriminatedUnion`). It:
- re-checks auth + connection ownership,
- re-validates the proposal shape,
- enforces the existing write rate-limit bucket,
- decrypts the connection key and hits PostgREST directly with
  `Prefer: return=representation`,
- writes one audit_log entry per affected row (capped at 10) using the
  same diff-capture path the row history panel uses.

## UX
- Each proposal renders as a colored card under the assistant message:
  warn-toned for updates, accent for inserts, danger for deletes.
- Update card shows filters, a column-level `from → to` diff against
  the first preview row, then a collapsible preview of affected rows.
- Delete card shows filters + a collapsible preview.
- Insert card shows the new row values.
- Apply / Discard buttons. Apply spins a loader, then turns into an
  "Applied · N rows" pill. Discard greys the card out.
- Errors render inline with an AlertTriangle and the server message.

## Safety
- The agent CANNOT directly write to PostgREST — the chat tool surface
  has no INSERT/PATCH/DELETE primitive. Only the propose_* tools exist,
  and they always return proposals.
- Apply uses the existing write-rate-limit bucket.
- Generated columns and primary-key columns are rejected at proposal
  time so the model can't try to set them.
- Views are rejected before a proposal is even built.

## Out of scope
- Bulk-import proposals.
- Rolling back a proposal (use the row history panel + manual edit).
- Multi-statement transactions.
