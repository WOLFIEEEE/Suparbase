# Contributing to Suparbase

Thanks for taking the time. Suparbase is an opinionated open-source admin
tool for Supabase projects: the bar for contributions is real but the
scope is small enough that a focused PR can ship quickly.

## What to know before you start

- **Read the constitution.** [`./.specify/memory/constitution.md`](./.specify/memory/constitution.md)
  is non-negotiable. It defines the performance budgets, the
  server/client boundary, the credential vault rules, and the
  accessibility floor. Every PR is reviewed against it.
- **The product is spec-first.** Significant features begin with a
  Spec-Kit cycle under [`specs/`](specs/): `spec.md`, `plan.md`,
  `tasks.md`. Small fixes and polish don't need that ceremony.
- **The stack is fixed.** Next.js 15 App Router, NextAuth v5, Drizzle ORM,
  Tailwind 3, Radix primitives, `@tanstack/react-query`, `cmdk`. New
  dependencies need justification: see the constitution's
  "Forbidden without justification" list.

## How to find something to work on

Good first issues are tagged [`good first issue`](https://github.com/WOLFIEEEE/Suparbase/labels/good%20first%20issue).
The audit of unfinished work for v0.7+ lives in [`CHANGELOG.md`](CHANGELOG.md)
under each release's "deferred" notes, and in the most recent
[`specs/`](specs/) folder under "Out of scope". Concretely, the
biggest open buckets right now are:

- **Power-user data ops**: bulk actions, CSV import/export, inline cell
  editing, saved filters/views per table.
- **Postgres-native parity**: SQL editor (read-only first), RLS policy
  viewer, `auth.users` dedicated admin, Supabase Storage browser.
- **Operability**: email verification, password reset, audit-log UI
  page, 2FA / passkeys, structured logs.

## Local development

Prerequisites: Node.js 20 LTS, `pnpm` 9, Postgres (Supabase, Neon, or
local Docker), optionally a GitHub OAuth app.

```bash
cp .env.example .env.local
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
echo "SUPARBASE_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env.local
# Fill in DATABASE_URL and (optionally) AUTH_GITHUB_ID / AUTH_GITHUB_SECRET

pnpm install
pnpm db:push      # apply the Drizzle schema to your DATABASE_URL
pnpm dev          # → http://localhost:3000
```

## The pre-merge gates

Every PR must pass these before review:

1. **`pnpm typecheck`**: `tsc --noEmit` returns clean. CI enforces this.
2. **`pnpm build`**: `next build` succeeds. CI enforces this. The
   constitution caps total JS at first paint of any authenticated route
   at 520 KB gzipped; check the `Route` table in the build output if
   you're touching bundle-sensitive code.
3. **Manual smoke**: for UI changes, walk the path you touched: sign
   in → create a connection → browse a table → edit a row → sign out.
   For spec-kit features, walk the spec's `quickstart.md` checklist.
4. **No `console.*` calls in shipped paths.** `rg "console\.(log|warn|error)" src/`
   should be empty.
5. **No new dependencies** unless explicitly justified in your PR
   description against the constitution's stack list.

## Style conventions

- **TypeScript strict mode.** No `any` in shipped code; use `unknown`
  and narrow.
- **Imports order:** built-in modules → external packages → `@/`
  aliases → relative paths.
- **Server-only files** must `import "server-only";` at the top.
  Client components must start with `"use client";`.
- **Spec-kit features ship with their artifacts.** If you start a
  spec, finish it: `spec.md` + `plan.md` + `tasks.md` minimum.
- **Commits** follow the loose `feat:` / `fix:` / `chore:` / `refactor:`
  prefix style. Bodies explain *why*, not *what*.

## How to propose a feature

For anything bigger than a one-line fix:

1. **Open an issue** describing the user problem and the scope. Cite
   the constitution principles your idea touches.
2. **If accepted**, run `/speckit-specify` against the constitution.
   That produces `specs/NNN-your-feature/spec.md`.
3. **Iterate**: `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze`
   → `/speckit-implement`. This isn't bureaucracy: each step catches
   issues earlier than implementation would.

For small fixes (typo, minor bug, polish): just open a PR with a
focused commit and a short description. No spec required.

## What we won't merge

- Changes that violate a NON-NEGOTIABLE principle (Performance,
  Accessibility, Server-side vault & proxy, Data & Security).
- New dependencies without a `Forbidden without justification` waiver.
- Code that bypasses the credential vault or the audit log.
- Anything that ships a secret to the browser.
- TODOs / FIXMEs / commented-out blocks in shipped output.

## Reporting security issues

Security issues should NOT be reported via public GitHub issues. Open a
GitHub Security Advisory at
<https://github.com/WOLFIEEEE/Suparbase/security/advisories/new>, or
contact the maintainers directly.

## License

By contributing, you agree that your contributions are licensed under
the same license as the project (see [`LICENSE`](LICENSE) if present;
otherwise the repository default applies).
