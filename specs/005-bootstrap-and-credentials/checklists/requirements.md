# Quality Checklist: 005-bootstrap-and-credentials

- [x] No [NEEDS CLARIFICATION] markers
- [x] All FRs testable on a local docker compose
- [x] Security: bcrypt cost 12, passwords never in logs, redactor patterns updated
- [x] Operator UX: zero env vars typed gets a working deploy
- [x] Operator awareness: README explicitly says backing up the secrets volume is non-optional
- [x] Backwards-compat: no breaking change for someone who DID set the three env vars in v0.4
- [x] Out-of-scope items listed explicitly (no email verification / reset)
