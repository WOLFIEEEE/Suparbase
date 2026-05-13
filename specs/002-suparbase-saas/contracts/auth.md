# Contract — Authentication

## NextAuth configuration

`src/server/auth.ts` exports a typed `auth()` helper, `signIn`/`signOut`
handlers, and the GET/POST route handlers expected by App Router.

```ts
// src/server/auth.ts (shape)
export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [GitHub({ /* OAuth */ })],
  session: { strategy: "database" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: { ...session.user, id: user.id },
    }),
  },
  trustHost: true,
});
```

## Required env

| Name                     | Purpose                                    |
|--------------------------|--------------------------------------------|
| `AUTH_SECRET`            | Cookie signing                             |
| `AUTH_GITHUB_ID`         | GitHub OAuth Client ID                     |
| `AUTH_GITHUB_SECRET`     | GitHub OAuth Client Secret                 |
| `AUTH_URL`               | Public origin (e.g. https://app.example)   |
| `DATABASE_URL`           | Postgres connection string                 |
| `SUPARBASE_ENCRYPTION_KEY` | Base64-encoded 32-byte vault key         |
| `SUPARBASE_ENCRYPTION_KEY_OLD` | Optional, for rotation                |

## Session shape (server-side)

```ts
type AppSession = {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  expires: string;
};
```

## Guards

- `auth()` is called server-side in:
  - `app/(auth)/layout.tsx` — redirects to `/signin?next=...` if null
  - every `api/connections/*` route handler
  - every `api/v/:id/*` route handler
- Client components call `useSession()` only for the user-menu UI
  (avatar/name); all sensitive checks happen server-side.

## Sign-in flow

1. User clicks "Sign in with GitHub" on `/signin`.
2. NextAuth `signIn("github")` redirects to GitHub.
3. GitHub redirects back to `/api/auth/callback/github`.
4. NextAuth creates / updates the `users` + `accounts` rows and sets
   the session cookie.
5. The page redirects to `?next` if present, otherwise `/connections`.
