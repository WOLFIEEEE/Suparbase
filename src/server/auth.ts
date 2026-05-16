import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./schema/auth";
import { credentialsProvider } from "./auth/credentials";

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
  }
}
