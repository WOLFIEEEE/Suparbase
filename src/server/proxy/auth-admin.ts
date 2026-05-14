import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";

const TIMEOUT_MS = 20_000;

export class AuthAdminError extends Error {
  status: number;
  category: string;
  constructor(category: string, message: string, status = 500) {
    super(message);
    this.category = category;
    this.status = status;
  }
}

export class ServiceRoleRequiredError extends AuthAdminError {
  constructor() {
    super(
      "service_role_required",
      "The Supabase Admin API needs a service_role key. Update this connection's stored key to manage users.",
      403,
    );
  }
}

function authHeaders(conn: ConnectionRow): Record<string, string> {
  const key = decryptKey(conn.encryptedKey);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "X-Client-Info": "suparbase-auth-admin/1.3",
  };
}

function requireServiceRole(conn: ConnectionRow): void {
  if (conn.role !== "service_role") throw new ServiceRoleRequiredError();
}

async function call<T>(
  conn: ConnectionRow,
  method: string,
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: BodyInit;
    expectEmpty?: boolean;
  } = {},
): Promise<T> {
  requireServiceRole(conn);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${conn.url}/auth/v1${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { ...authHeaders(conn), ...(init.headers ?? {}) },
      body: init.body,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new AuthAdminError(
      "network",
      `Could not reach the auth admin API (${(e as Error).message ?? "network"}).`,
      502,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const category =
      res.status === 401 || res.status === 403
        ? "unauthorized"
        : res.status === 404
        ? "not_found"
        : res.status === 422 || res.status === 400
        ? "validation"
        : "server";
    throw new AuthAdminError(category, detail.slice(0, 400) || `Auth admin ${res.status}`, res.status);
  }
  if (init.expectEmpty || res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailConfirmedAt: string | null;
  phoneConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  bannedUntil: string | null;
  providers: string[];
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

interface RawIdentity {
  provider?: string;
}

interface RawUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  identities?: RawIdentity[];
}

function normalise(u: RawUser): AuthUser {
  const providers = Array.isArray(u.identities)
    ? Array.from(
        new Set(u.identities.map((i) => i.provider ?? "unknown").filter((p) => !!p) as string[]),
      )
    : [];
  return {
    id: u.id,
    email: u.email ?? null,
    phone: u.phone ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? u.confirmed_at ?? null,
    phoneConfirmedAt: u.phone_confirmed_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
    createdAt: u.created_at ?? "",
    updatedAt: u.updated_at ?? null,
    bannedUntil: u.banned_until ?? null,
    providers,
    appMetadata: u.app_metadata ?? {},
    userMetadata: u.user_metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListUsersResult {
  users: AuthUser[];
  total: number | null;
  page: number;
  perPage: number;
}

interface RawListResponse {
  users?: RawUser[];
  aud?: string;
  total?: number;
  page?: number;
  per_page?: number;
  next_page?: number | null;
  last_page?: number | null;
}

export async function listUsers(
  conn: ConnectionRow,
  page: number,
  perPage: number,
): Promise<ListUsersResult> {
  const url = `/admin/users?page=${page}&per_page=${perPage}`;
  const raw = await call<RawListResponse>(conn, "GET", url);
  const users = (raw.users ?? []).map(normalise);
  return {
    users,
    total: typeof raw.total === "number" ? raw.total : null,
    page,
    perPage,
  };
}

// ---------------------------------------------------------------------------
// Get / create / invite / update / delete / recovery
// ---------------------------------------------------------------------------

export async function getUser(conn: ConnectionRow, userId: string): Promise<AuthUser> {
  const raw = await call<RawUser>(conn, "GET", `/admin/users/${userId}`);
  return normalise(raw);
}

export interface CreateUserInput {
  email?: string;
  phone?: string;
  password?: string;
  emailConfirm?: boolean;
  phoneConfirm?: boolean;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

export async function createUser(conn: ConnectionRow, input: CreateUserInput): Promise<AuthUser> {
  const body: Record<string, unknown> = {};
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;
  if (input.password) body.password = input.password;
  if (input.emailConfirm != null) body.email_confirm = input.emailConfirm;
  if (input.phoneConfirm != null) body.phone_confirm = input.phoneConfirm;
  if (input.userMetadata) body.user_metadata = input.userMetadata;
  if (input.appMetadata) body.app_metadata = input.appMetadata;
  const raw = await call<RawUser>(conn, "POST", `/admin/users`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return normalise(raw);
}

export interface UpdateUserInput {
  email?: string;
  phone?: string;
  password?: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
  /** ISO duration string ("24h", "168h"…) or "none" to unban. */
  banDuration?: string;
}

export async function updateUser(
  conn: ConnectionRow,
  userId: string,
  patch: UpdateUserInput,
): Promise<AuthUser> {
  const body: Record<string, unknown> = {};
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.phone !== undefined) body.phone = patch.phone;
  if (patch.password) body.password = patch.password;
  if (patch.userMetadata) body.user_metadata = patch.userMetadata;
  if (patch.appMetadata) body.app_metadata = patch.appMetadata;
  if (patch.banDuration !== undefined) body.ban_duration = patch.banDuration;
  const raw = await call<RawUser>(conn, "PUT", `/admin/users/${userId}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return normalise(raw);
}

export async function deleteUser(conn: ConnectionRow, userId: string): Promise<void> {
  await call(conn, "DELETE", `/admin/users/${userId}`, { expectEmpty: true });
}

/**
 * GoTrue's generate_link with `type=recovery` returns a magic-link URL. We
 * use this for "send password reset" — the admin can copy the URL or have
 * GoTrue email it depending on the project's SMTP config.
 */
export interface RecoveryLink {
  actionLink: string;
  email: string;
}

interface RawLinkResponse {
  action_link?: string;
  email?: string;
  email_otp?: string;
  hashed_token?: string;
  redirect_to?: string;
  verification_type?: string;
}

export async function generateRecoveryLink(
  conn: ConnectionRow,
  email: string,
): Promise<RecoveryLink> {
  const raw = await call<RawLinkResponse>(conn, "POST", "/admin/generate_link", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", email }),
  });
  return {
    actionLink: raw.action_link ?? "",
    email: raw.email ?? email,
  };
}

export async function sendInvite(
  conn: ConnectionRow,
  email: string,
  data?: Record<string, unknown>,
): Promise<AuthUser> {
  const raw = await call<RawUser>(conn, "POST", "/invite", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, data }),
  });
  return normalise(raw);
}
