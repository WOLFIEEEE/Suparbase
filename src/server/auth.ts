import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./schema/auth";
import { credentialsProvider } from "./auth/credentials";

/**
 * Per-process cache for `users.password_changed_at`, so the session-
 * revocation check below doesn't cost a DB round-trip on every auth()
 * call. 60s TTL bounds how long a just-revoked session can linger on
 * another instance — the same trade-off as the agent-session cache.
 */
const PWD_CHANGED_TTL_MS = 60 * 1000;
const pwdChangedCache = new Map<string, { at: number | null; fetchedAt: number }>();

/** Drop the cached revocation stamp so a password change made on this
 *  instance takes effect on the very next request, not after the TTL. */
export function invalidatePasswordChangedCache(userId: string): void {
  pwdChangedCache.delete(userId);
}

async function passwordChangedAtMs(userId: string): Promise<number | null> {
  const cached = pwdChangedCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < PWD_CHANGED_TTL_MS) return cached.at;
  try {
    const rows = await db
      .select({ at: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows.length === 0) {
      // User row is gone (deleted account) — treat as revoked.
      pwdChangedCache.set(userId, { at: Number.MAX_SAFE_INTEGER, fetchedAt: Date.now() });
      return Number.MAX_SAFE_INTEGER;
    }
    const at = rows[0].at?.getTime() ?? null;
    pwdChangedCache.set(userId, { at, fetchedAt: Date.now() });
    return at;
  } catch {
    // DB hiccup: fail open so a transient outage can't sign everyone out.
    return null;
  }
}

export function isGithubEnabled(): boolean {
  return !!(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
}

const providers: NextAuthConfig["providers"] = [credentialsProvider];

if (isGithubEnabled()) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  // JWT strategy is required for the Credentials provider to coexist
  // with the database adapter. OAuth users still get their User /
  // Account rows persisted via the adapter; the session itself rides
  // in a signed cookie.
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.id;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = user.image ?? token.picture;
        // Surface the 2FA requirement on the JWT so middleware can
        // gate without an extra DB round-trip. We look it up once at
        // signin time; subsequent refreshes reuse the cached flag.
        token.requires2FA = user.totpEnabled === true;
        // Issue-time stamp for session revocation: tokens older than
        // users.password_changed_at are rejected below.
        token.authAt = Date.now();
        return token;
      }
      if (token.id) {
        const changedAt = await passwordChangedAtMs(token.id);
        // A missing authAt means the session predates this mechanism —
        // if the password has changed since, revoke it too.
        if (changedAt != null && changedAt > (token.authAt ?? 0)) {
          return null;
        }
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  trustHost: true,
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  // The authorize() callback returns this shape; the jwt callback
  // reads `totpEnabled` to decide whether to set `requires2FA` on
  // the token. Without this declaration, TS narrows away the field.
  interface User {
    totpEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** True when this user has 2FA enabled and the current session
     *  hasn't yet cleared the second factor (gated by middleware). */
    requires2FA?: boolean;
    /** Epoch ms the credentials were verified (signin). Sessions with
     *  authAt < users.password_changed_at are revoked. */
    authAt?: number;
  }
}
