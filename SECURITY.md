# Security policy

## Supported versions

Suparbase is a single-trunk project: only the latest tagged release
on `main` receives security fixes. Older tags exist as historical
references only.

## Reporting a vulnerability

**Please do not file public GitHub issues for security problems.**

Use GitHub's private vulnerability reporting:

1. Go to <https://github.com/WOLFIEEEE/Suparbase/security/advisories/new>.
2. Describe the issue, the impact you've seen, and how to reproduce.
3. We'll respond within 5 business days with a triage decision and a
   timeline. Most fixes ship in the next minor release; critical
   issues get a same-week patch.

If you can't use the GitHub form, open a normal issue saying *only*
"security report, please contact me privately" and we'll reach out.

## What's in scope

- The hosted instance at the URL configured for your deployment.
- Any code in this repository: the Next.js app, the Drizzle migrations,
  the Coolify deploy files.
- Anything reachable via the server-side proxy (`/api/v/[id]/**`).
- The Supabase credentials vault and the AES-256-GCM at-rest encryption.
- The team-invitation token flow.

## What's not in scope

- Issues in third-party services (Supabase itself, Resend, OpenRouter,
  Coolify), report those to the respective vendors.
- Dedicated single-tenant Team deployments running outdated builds.
  Please ensure you're on the latest release before reporting.
- Social-engineering, physical attacks, or rate-limit findings without
  a concrete impact path.

## Hardening defaults baked into the project

- The Supabase API key never reaches the browser. All requests are
  proxied server-side; the encrypted blob is decrypted only inside
  the Node process.
- Connections store AES-256-GCM-encrypted credentials with a
  deployment-wide vault key (`SUPARBASE_ENCRYPTION_KEY`).
- Read-only-by-default for AI write operations (proposals require
  explicit Apply by the user).
- The SQL playground runs inside `BEGIN READ ONLY` transactions by
  default; write mode is opt-in per query.
- Custom-action webhooks reject private-network targets to block SSRF.
- Team-invitation tokens are 32-byte url-safe random strings,
  expire after 7 days, and require an email match to accept.

Thanks for keeping Suparbase users safe.
