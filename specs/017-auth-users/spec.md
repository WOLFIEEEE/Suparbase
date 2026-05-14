# Auth users page (v1.3)

## Goal
Manage Supabase Auth users: invite, recover password, ban, delete :
from inside the workspace using the project's Admin API.

## Server
- `src/server/proxy/auth-admin.ts`: typed wrappers around
  `${conn.url}/auth/v1/admin/*` and `/auth/v1/invite`:
  - `listUsers(page, perPage)` → `{users, total, page, perPage}`
  - `getUser(uid)`, `createUser`, `updateUser`, `deleteUser`
  - `generateRecoveryLink(email)` → magic-link URL for password reset
  - `sendInvite(email, data?)`: invites a new user
- Every helper calls `requireServiceRole(conn)` first and throws
  `ServiceRoleRequiredError` if the stored key is anon/authenticated.
  The page surfaces this as a friendly "service_role key required"
  banner instead of an error toast.

## API
- `GET /api/v/[id]/auth-users?page=N&per_page=M` → paginated list
- `POST /api/v/[id]/auth-users`: `{mode: "invite" | "create", ...}` →
  invite or create. Validates email + password via zod.
- `GET /api/v/[id]/auth-users/[uid]` → single user
- `PATCH /api/v/[id]/auth-users/[uid]`: update email/phone/password/
  metadata/ban_duration
- `DELETE /api/v/[id]/auth-users/[uid]`
- `POST /api/v/[id]/auth-users/[uid]/recovery` → generates a recovery
  action link the admin can copy or have GoTrue email.

## UX
- New sidebar entry `Auth users`.
- Page splits into a list pane (left) and a detail pane (right).
- List shows email/phone/uuid, providers as small chips, last sign-in
  time, and a "banned" / "unconfirmed" tag when applicable. Pagination
  via Prev/Next; client-side search filter on top of the loaded page.
- Detail pane shows created, last sign-in, email-confirmed timestamp,
  providers, status pill, and metadata (collapsible JSON).
- Actions: Generate recovery link (copies to clipboard), Copy user id,
  Ban / Unban (toggles 1-year ban_duration), Delete (confirms).
- Invite dialog accepts a single email and posts `{mode: "invite"}`.

## Graceful degradation
- If `connection.role !== "service_role"`, the page shows a banner
  explaining what the user needs to change and links to the connection
  settings. No auth admin calls are made.

## Out of scope (v1.3)
- Editing user_metadata / app_metadata inline.
- Bulk operations.
- Impersonate / "sign in as user" flow.
- Sorting + server-side search across the whole user table.
