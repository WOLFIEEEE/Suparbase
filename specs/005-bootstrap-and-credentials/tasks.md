# Tasks: Self-bootstrap & credentials auth

## Phase 1: Bootstrap
- [ ] T001 Add `bootstrap` service to `docker-compose.yaml`; declare `suparbase_secrets` volume.
- [ ] T002 Wire `db` to `POSTGRES_PASSWORD_FILE` (mount `suparbase_secrets:/run/secrets:ro`).
- [ ] T003 Update `app` env block: declare `POSTGRES_PASSWORD_FILE`, `AUTH_SECRET_FILE`, `SUPARBASE_ENCRYPTION_KEY_FILE`; mount `suparbase_secrets:/secrets:ro`.
- [ ] T004 Rewrite `scripts/docker-entrypoint.sh`: load *_FILE → env, compose DATABASE_URL, fail fast on missing critical secrets.
- [ ] T005 Default `AUTH_URL` to `https://suparbase.com` in compose.

## Phase 2: Schema & auth
- [ ] T010 Add `password_hash text` to `users` in `src/server/schema/auth.ts`.
- [ ] T011 Add `bcryptjs` dep + `@types/bcryptjs`.
- [ ] T012 Write `src/server/auth/passwords.ts`: `hash(plain)` / `verify(plain, hash)`.
- [ ] T013 Write `src/server/auth/credentials.ts`: Credentials provider with `authorize()` using bcrypt.
- [ ] T014 Write `src/server/auth/signup.ts`: `createUserAccount(name, email, password)` with email-uniqueness, bcrypt, rate-limit.
- [ ] T015 Update `src/server/auth.ts`: switch to JWT strategy, compose providers conditionally on env, add Credentials.
- [ ] T016 Generate migration `pnpm db:generate`.

## Phase 3: API + UI
- [ ] T020 Write `src/app/api/auth/signup/route.ts`: POST handler; rate-limited.
- [ ] T021 Extend rate limiter with `signup` bucket (5/hour/IP).
- [ ] T022 Write `src/components/auth/SignInForm.tsx`: email+password client form; conditional GitHub button.
- [ ] T023 Write `src/components/auth/SignUpForm.tsx`.
- [ ] T024 Rewrite `src/app/signin/page.tsx` as server component that reads `process.env.AUTH_GITHUB_ID` and passes a `githubEnabled` prop.
- [ ] T025 Write `src/app/signup/page.tsx` as server component (same pattern).
- [ ] T026 Add cross-links: "New here? Create an account" / "Already have an account? Sign in".

## Phase 4: Polish
- [ ] T030 Update `src/lib/redact.ts`: add bcrypt prefixes (`$2a$`, `$2b$`, `$2y$`).
- [ ] T031 Update `.env.example`: all six vars are now optional; explain the secrets-volume contract.
- [ ] T032 README: "Coolify deploy" section: drop the env-var table to ZERO required vars; document the volume-backup caveat.
- [ ] T033 Constitution patch to v3.2.0: clarify auto-generated secrets are permitted with volume persistence + operator warning.

## Phase 5: Verify
- [ ] T040 `pnpm typecheck` clean.
- [ ] T041 `pnpm build` clean; bundle delta ≤ +10 KB gz.
- [ ] T042 Migrator runs locally against a postgres-in-docker (or fails fast and cleanly).
- [ ] T043 Manual signup smoke (with `pnpm dev` + a local postgres): create account → sign in → sign out → sign back in.
- [ ] T044 Merge to main, tag v0.5.0, push.
