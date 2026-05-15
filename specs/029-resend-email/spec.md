# Resend transactional email (v2.4.1)

## Why
v2.4 introduced team invitations but shipped invite-by-link only -
owners had to copy a URL and paste it somewhere. This release wires
Resend in so invitations get emailed directly, without removing the
copy-link fallback (so self-hosters with no email infra still work).

## What

### Email module, reusable
- `src/server/email/resend.ts`
  - `getEmailConfig()`: reads `RESEND_API_KEY` + `EMAIL_FROM` from
    env, returns `{ configured, from, reason }` so callers can branch.
  - `sendEmail({ to, subject, html, text, tag, ... })`: returns a
    tagged result (`{ delivered, reason, error, id }`) instead of
    throwing. "Not configured" is a successful no-op return, not a
    failure path.
- `src/server/email/templates/invitation.ts`
  - `renderInvitationEmail({ token, connectionName, role, ... })`
    returns `{ subject, html, text, url }`. HTML uses table layout
    + inline styles for cross-client rendering; matches the v1.5
    visual language (Inter + JetBrains Mono, accent color, hairline
    borders). Plain-text version included for deliverability.

### Wired into invitations
- `POST /api/connections/[id]/members/invitations` now calls
  `sendEmail()` after creating the invitation row. Response body
  gains a `delivery` field: `{ emailed, reason, error }`.
- New `POST /api/connections/[id]/members/invitations/[invId]/resend`
  for re-sending an existing invitation (e.g. delivery failed once
  or invitee asked for it again).
- New `GET /api/email/status`, auth-gated, returns
  `{ configured, reason, from }` so the UI can show the right copy.

### UI changes
- Invite dialog reads `/api/email/status` and switches its copy:
  - configured: "We'll email the invitation from <sender>"
  - not configured: explains the env-var fallback to a copy-link
    invitation, no scary error
- After invite creation:
  - emailed: success toast `Invitation emailed to <addr>`
  - email-failed-while-configured: warning toast `Email send
    failed (...). Share the link manually.`
- Pending-invitations list gets a `Resend` button (visible only
  when email is configured); the existing "Get link" button stays
  available for both paths.
- Share-link dialog re-titles itself ("Emailed to ..." vs "Share
  this link with ...") and shows whichever copy fits the state.

### Configuration
- `RESEND_API_KEY`, required for email delivery
- `EMAIL_FROM`, required, must be a verified Resend sender
- `EMAIL_REPLY_TO`, optional, Reply-To header
- All three documented in `.env.example` and exposed via
  `docker-compose.yaml` for Coolify.

## Safety
- No secrets returned by `/api/email/status`. We echo `EMAIL_FROM`
  (already a public sender label) so the owner can confirm which
  sender the email is coming from.
- `sendEmail()` swallows configuration gaps as a no-op return.
  Network failures from Resend are tagged `reason: "failed"` with
  the error message preserved.
- No PII leaves the deployment that wasn't already going to leave
  via the invite link (the email body is the link + role +
  connection name).

## Out of scope
- Other transactional emails (welcome, password reset). The module
  is reusable for those, but only invitations use it today.
- Email-template management UI (sender, custom HTML). Configure
  via env / Coolify for now.
- Inbound webhook handling (Resend bounces / complaints).
