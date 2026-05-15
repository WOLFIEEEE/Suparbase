# Team workspace — multi-user connections (v2.4)

## Why
The single-user model has been the biggest adoption ceiling. Support
needs to see customer data. Finance needs to read order tables. Ops
needs to run actions. Without team access, every company that picks
Suparbase eventually peels off a custom panel just so the rest of the
team can see anything. v2.4 fixes that.

## Data model

```
connection_member
  id, connection_id, user_id, role ('editor' | 'viewer'),
  invited_by, invited_at, accepted_at
  UNIQUE(connection_id, user_id)

connection_invitation
  id, connection_id, email, role,
  token (url-safe random, 32 bytes),
  invited_by, expires_at (7 days), accepted_at, created_at
```

`owner` is the implicit role attached to `connections.user_id`. We
don't store an `owner` row in `connection_member` to avoid two
sources of truth.

## Access model
- **viewer**: read everything.
- **editor**: read + write (insert/update/delete rows, run SQL, run
  actions, run widgets).
- **owner**: everything including rename, delete, transfer, members
  management.

### What v2.4 enforces
- `getConnectionForUser()` returns the connection if the user is the
  owner OR a member with any role (existing routes keep working).
- `listConnections()` returns owned + member-of connections, with a
  `role` tag on each summary.
- Owner-only routes: rename/delete connection, all member-management
  routes, invite creation.

### What v2.4 defers
- Per-route viewer-vs-editor enforcement on data writes (the proxy
  doesn't yet know "this user is a viewer, reject PATCH"). The role
  is stored, surfaced in UI (we hide edit buttons for viewers), and
  set up for v2.4.x to enforce server-side. The honest framing: this
  is "team read access" first, "team write access" once we land the
  proxy-side gate.
- Column-level masking per role.
- Email delivery of invitations. v2.4 ships invite-by-link: the owner
  copies a URL and pastes it where they like. Email integration
  later.

## Invite flow
1. Owner opens `/c/[id]/settings` → Members section → "Invite".
2. Enters email + role, clicks Invite. We create a
   `connection_invitation` with a fresh 256-bit token.
3. The dialog shows the URL `/invitations/<token>`. Owner copies it,
   shares it however they like.
4. Invitee opens the URL. If signed in: they see the invitation
   summary and click Accept. If their session email matches the
   invitation email, we insert a `connection_member` row and redirect
   to `/c/<connectionId>`.
5. If not signed in: redirect to sign-in with `?next=/invitations/<t>`.
6. Tokens expire after 7 days; accepting marks the invitation
   accepted; expired or already-accepted tokens show an error page.

## Surfaces
- **Members section on `/c/[id]/settings`**: list of current members
  (avatar / email / role / invited-by / actions), pending
  invitations table (email / role / link / expires-in / revoke), and
  an "Invite teammate" dialog.
- **Connections list**: each card shows an "owner" / "editor" /
  "viewer" tag.
- **`/invitations/[token]`**: server-rendered page that resolves the
  invitation and renders accept / reject UI.

## API
- `GET /api/connections/[id]/members` — list members + pending invites
- `POST /api/connections/[id]/members/invitations` — create an invite
- `DELETE /api/connections/[id]/members/invitations/[invId]` — revoke
- `PATCH /api/connections/[id]/members/[memberId]` — change role
- `DELETE /api/connections/[id]/members/[memberId]` — remove member
- `POST /api/invitations/[token]/accept` — accept (callable by the
  signed-in user whose email matches the invitation)

All connection-member admin routes require the **owner** role.
