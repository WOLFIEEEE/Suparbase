# Global row search (v1.2)

## Goal
From the Cmd-K palette, find a row anywhere in the project by typing a
value (email, uuid, order number, etc.) without first knowing which
table to look in.

## Scope
- Triggered whenever the palette query is 2+ characters.
- Server scans every public-schema, non-view table in parallel.
- Matches:
  - String/text columns via case-insensitive ilike `%term%`.
  - UUID columns via eq match (only when the term looks like a uuid).
  - Integer/float columns via eq match (only when the term parses as a
    number).
- Each table contributes at most 5 hits; total cap 30; per-table limit
  of 4 text columns scanned.

## API
`POST /api/v/[id]/search` — `{q: string}` → `{hits: SearchHit[]}` where
`SearchHit = {table, schema, primaryKey, matchedColumn, snippet}`.
Read-rate limited, no writes, schema introspection cached.

## UX
- Palette shows a "Rows matching <q>" group above the Tables group.
- Each hit renders as `<table> <snippet> <matched column>`.
- Enter navigates straight to the row detail page using the existing
  PK encoder.
- Loading + empty states inline; never blocks navigation suggestions.

## Out of scope
- JSON column matching.
- Cross-schema search (auth/storage stays excluded).
- Ranking — first-match-wins per table.
