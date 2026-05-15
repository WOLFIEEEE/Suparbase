import "server-only";

/**
 * Admin allowlist is configured via SUPARBASE_ADMIN_EMAILS — a CSV of
 * email addresses (compared case-insensitively). If the env is unset
 * or empty, the admin panel is disabled entirely. Bootstrap admins
 * never live in the database; this keeps the panel guarded even if
 * an attacker manages to mutate an `is_admin` boolean (no such column
 * exists by design).
 */
function parseAdminEmails(): Set<string> {
  const raw = process.env.SUPARBASE_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s.includes("@")),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parseAdminEmails();
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}

export interface AdminSession {
  userId: string;
  email: string;
  name: string | null;
}

/**
 * Returns the authenticated admin session, or null when the caller
 * isn't on the allowlist (or isn't signed in at all). Routes/pages
 * should treat null the same as "not authenticated" — typically
 * `notFound()` (don't acknowledge the surface).
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  // Dynamic import so test files that exercise the pure CSV-parsing
  // helpers (isAdminEmail / isAdminPanelEnabled) don't pull in the
  // NextAuth runtime, which would need a real DB + AUTH_SECRET.
  const { auth } = await import("@/server/auth");
  const session = await auth();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;
  if (!userId || !email || !session) return null;
  if (!isAdminEmail(email)) return null;
  return {
    userId,
    email,
    name: session.user?.name ?? null,
  };
}

/** True iff the admin panel is reachable in this deployment. */
export function isAdminPanelEnabled(): boolean {
  return parseAdminEmails().size > 0;
}
