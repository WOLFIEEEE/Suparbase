import "server-only";
import postgres from "postgres";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { assertSafePostgresConnectionString } from "@/server/security/egress";

export class NoPostgresUrlError extends Error {
  constructor() {
    super("Direct Postgres URL is not configured on this connection.");
    this.name = "NoPostgresUrlError";
  }
}

export class PgQueryError extends Error {
  detail: string | undefined;
  constructor(message: string, detail?: string) {
    super(message);
    this.detail = detail;
  }
}

const ROLE_ALLOWLIST = new Set([
  "anon",
  "authenticated",
  "service_role",
  "postgres",
]);

interface QueryOptions {
  /** Postgres role to switch to inside the transaction. */
  role?: string;
  /** `request.jwt.claims` object: JSON-serialized into a Postgres GUC. */
  claims?: Record<string, unknown>;
  /** Statement timeout (ms) for the simulated query. */
  timeoutMs?: number;
}

async function openPostgres(conn: ConnectionRow): Promise<ReturnType<typeof postgres>> {
  if (!conn.encryptedPostgresUrl) throw new NoPostgresUrlError();
  const url = await assertSafePostgresConnectionString(decryptKey(conn.encryptedPostgresUrl));
  return postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {
      /* silence NOTICE / INFO so they don't end up on stderr */
    },
  });
}

/**
 * Run `fn` against the user's Postgres database with the role + JWT claims
 * a PostgREST request would have, inside a transaction that always rolls
 * back. Used by the RLS debugger so a simulated SELECT/INSERT/... never
 * leaves any trace on the user's data.
 */
export async function withRlsSimulation<T>(
  conn: ConnectionRow,
  options: QueryOptions,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const role = options.role ?? "authenticated";
  if (!ROLE_ALLOWLIST.has(role)) {
    throw new PgQueryError(`Refusing to simulate role "${role}".`);
  }
  const sql = await openPostgres(conn);
  let captured: T | undefined;
  let capturedErr: unknown;
  try {
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = ${options.timeoutMs ?? 5000}`;
        // Role is validated against an allow-list above so .unsafe is safe.
        await tx.unsafe(`SET LOCAL ROLE "${role}"`);
        const claimsJson = options.claims ? JSON.stringify(options.claims) : "";
        await tx`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`;
        if (options.claims && typeof options.claims.role === "string") {
          await tx`SELECT set_config('request.jwt.claim.role', ${String(options.claims.role)}, true)`;
        }
        try {
          captured = await fn(tx);
        } catch (e) {
          capturedErr = e;
        }
        // Always abort the transaction so the simulator has zero side effects.
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    if (capturedErr) {
      const detail = capturedErr instanceof Error ? capturedErr.message : String(capturedErr);
      throw new PgQueryError(detail);
    }
    return captured as T;
  } catch (e) {
    if (e instanceof PgQueryError || e instanceof NoPostgresUrlError) throw e;
    throw new PgQueryError((e as Error).message ?? "Postgres query failed.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

class Rollback extends Error {
  constructor() {
    super("rollback");
    this.name = "Rollback";
  }
}

// ---------------------------------------------------------------------------
// pg_policies introspection
// ---------------------------------------------------------------------------

export interface PgPolicy {
  schema: string;
  table: string;
  policy: string;
  command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  permissive: boolean;
  roles: string[];
  using: string | null;
  check: string | null;
}

/**
 * List every RLS policy in the public schema. Touches no row data: just
 * pg_catalog. Used by the policy browser.
 */
export async function listPolicies(conn: ConnectionRow): Promise<PgPolicy[]> {
  const sql = await openPostgres(conn);
  try {
    const rows = await sql<PgPolicy[]>`
      SELECT
        schemaname AS schema,
        tablename  AS table,
        policyname AS policy,
        cmd        AS command,
        permissive = 'PERMISSIVE' AS permissive,
        coalesce(roles, '{}')::text[] AS roles,
        qual       AS using,
        with_check AS check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `;
    return rows;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export interface RlsStatusEntry {
  table: string;
  rlsEnabled: boolean;
  policyCount: number;
}

export async function listRlsStatus(conn: ConnectionRow): Promise<RlsStatusEntry[]> {
  const sql = await openPostgres(conn);
  try {
    const rows = await sql<RlsStatusEntry[]>`
      SELECT
        c.relname AS table,
        c.relrowsecurity AS "rlsEnabled",
        (
          SELECT count(*)::int
          FROM pg_policies p
          WHERE p.schemaname = n.nspname AND p.tablename = c.relname
        ) AS "policyCount"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    return rows;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
