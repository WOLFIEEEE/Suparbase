# Quality Checklist: 004-deploy-coolify

- [x] No [NEEDS CLARIFICATION] markers
- [x] FRs testable on a local docker compose
- [x] Out-of-scope explicit (no Studio bundling, no horizontal scale, no replicas)
- [x] Security: image runs non-root; no host-port binding; secrets never in Dockerfile
- [x] Idempotent migrations: `drizzle-orm` migrator records applied SQL in `__drizzle_migrations`
- [x] README updated with a copy-pasteable Coolify guide
