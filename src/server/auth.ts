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
        const t = token as typeof token & { id?: string; requires2FA?: boolean };
        t.id = (user as { id?: string }).id ?? t.id;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = user.image ?? token.picture;
        // Surface the 2FA requirement on the JWT so middleware can
        // gate without an extra DB round-trip. We look it up once at
        // signin time; subsequent refreshes reuse the cached flag.
        const u = user as { totpEnabled?: boolean };
        t.requires2FA = u.totpEnabled === true;
      }
      return token;
    },
    session: ({ session, token }) => {
      const t = token as { id?: string; requires2FA?: boolean };
      if (session.user && t.id) {
        session.user.id = t.id;
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
}
