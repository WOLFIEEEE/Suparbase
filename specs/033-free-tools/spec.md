# 033 · Free public tools (acquisition hooks)

**Version target:** v3.18.0 · **Status:** in progress

Four free, no-login tools under `/tools/*` that deliver value in one paste
and convert to sign-up. Each reuses code the product already has. Three run
**entirely in the browser** (nothing leaves the page — a trust story we lean
on); one (the security scanner) needs a stateless server route because the
scan is a cross-origin fetch we must make server-side.

## Goals

- Instant value with zero friction (no account, no config).
- SEO-friendly, shareable, on-brand ("catch the next Moltbook").
- Every tool ends in a sign-up CTA that maps to a paid/account capability
  (continuous monitoring, live RLS simulation, editing real data).
- No new heavy dependencies; reuse existing patterns.

## The four tools

### 1. Supabase Security Scanner — `/tools/supabase-security-scanner`

Paste a Supabase project URL (+ optional anon key) → server runs the Agent
Sentry **anon-probe** and returns a security score + findings (anon-readable
tables, RLS-off, PII exposure). The anon key is *public by design* (it ships
in every client bundle), so probing with it is honest and safe.

- **Server route:** `POST /api/tools/security-scan`, **stateless** — scans,
  returns, **never persists** the URL/key/results.
- **Safety:**
  - SSRF: `https:` only; host must end in `.supabase.co` / `.supabase.in`
    (the hosted domains — also neatly kills SSRF to internal networks).
    Self-hosters use the full account product.
  - IP rate-limit (token bucket) — a public endpoint that makes outbound
    fetches is an abuse target; also an explicit "I own this project"
    checkbox (anti-mass-scanner).
  - Per-scan table cap + timeout so one request can't fan out forever.
- **Reuse:** the anon-probe channel of `src/server/sentry/probe.ts`
  (REST OpenAPI table discovery + per-table anon read + PII heuristic),
  extracted into a pure `scanProjectAnon(url, anonKey)`.
- **Convert:** findings free; "one-click quarantine, continuous re-scans,
  Slack alerts on new exposure → sign up" (all real account features).

### 2. RLS Policy Generator + Explainer — `/tools/rls-policy-generator`

Two modes, both **client-side + deterministic** (no AI, no network):

- **Generate:** table + columns + a chosen access pattern (owner-by-column,
  public read, authenticated read / read-write, admin-only, service-role
  only) → emits `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`
  SQL.
- **Explain:** paste a `CREATE POLICY …` statement → plain-English
  description (role, command, USING / WITH CHECK intent).
- **Convert:** "test these against real roles in the live RLS simulator →
  sign up" (reuses the RLS debugger, spec 015).

### 3. Schema → ERD Visualizer — `/tools/schema-visualizer`

Paste SQL DDL (`CREATE TABLE …`, a `pg_dump`, Supabase schema) →
**client-side** parse tables / columns / PK / FK → render an SVG ERD with
FK links. Copy/download the SVG.

- **Convert:** "browse and edit this data, not just diagram it → sign up."

### 5. Postgres to TypeScript Type Generator — `/tools/schema-to-typescript`

Paste SQL DDL, get TypeScript interfaces or Zod schemas. Client-side, reuses
the ERD tool's `parseDdl`. Maps pg types to TS/Zod with correct nullability
and array handling. Convert: "type the rows here, then edit them in a full
workspace."

### 4. Secret / Key Leak Scanner — `/tools/secret-scanner`

Paste code / `.env` / logs → **client-side** scan flags leaked secrets
(service-role JWT = critical, anon JWT, `sk-`/`re_`/`whsec_`/`ghp_` tokens,
Postgres URLs, raw symmetric keys) with type + severity + position. Nothing
leaves the browser.

- **Reuse:** the pattern set behind `src/lib/redact.ts`, lifted into a
  structured `scanSecrets(text)` (typed matches + severity).
- **Convert:** "keys leak — proxy them server-side so they never reach the
  browser → sign up" (the core product promise).

## Architecture

- Pages under `src/app/(public)/tools/…` (or `src/app/tools/…` matching the
  existing public route location), each using `PublicLayout` + per-page SEO
  metadata + JSON-LD (`SoftwareApplication`/`WebApplication`).
- Shared `ToolShell` (hero: eyebrow/title/subtitle) + `ToolCTA` (sign-up
  band) components.
- Pure libs under `src/lib/tools/`: `secret-scan.ts`, `rls-generate.ts`,
  `rls-explain.ts`, `ddl-parse.ts` — each unit-tested (no DB, no network).
- Server: `src/server/tools/anon-scan.ts` (stateless probe) +
  `src/app/api/tools/security-scan/route.ts`.
- Wiring: `/tools` index page, footer "Free tools" links, sitemap entries,
  robots stays open.

## Non-goals

- No persistence of any scanned data.
- No AI dependency (keeps the tools free + private).
- Self-hosted Supabase in the scanner (hosted domains only, by design).

## Verification

Unit tests for the three pure libs; typecheck + build; browser-verify each
page renders and the scanner route returns findings / rejects SSRF + bad
input / rate-limits.
