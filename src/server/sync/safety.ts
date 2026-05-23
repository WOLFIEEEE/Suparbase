import "server-only";
import { createHash } from "node:crypto";
import postgres from "postgres";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { NoPostgresUrlError } from "@/server/proxy/postgres";

export class SyncSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncSafetyError";
  }
}

export class SyncBusyError extends Error {
  constructor(message = "A sync to this target is already running.") {
    super(message);
    this.name = "SyncBusyError";
  }
}

/**
 * Open the **base** connection. The session is forced read-only at the
 * startup-packet level (`default_transaction_read_only = on`), so *every*
 * transaction on this client — implicit or explicit — is read-only. This
 * is the structural guarantee that sync can never write to the base: there
 * is no code path that hands out a writable base handle.
 */
export function openBaseClient(conn: ConnectionRow): postgres.Sql<Record<string, never>> {
  if (!conn.encryptedPostgresUrl) throw new NoPostgresUrlError();
  const url = decryptKey(conn.encryptedPostgresUrl);
  return postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: {
      application_name: "suparbase-sync-base",
      // Force every transaction on this session read-only at the
      // startup-packet level — the structural guarantee that sync can
      // never write to the base.
      default_transaction_read_only: true,
    },
    onnotice: () => {},
  });
}

/** Open the **target** connection (writable). Caller owns the transaction. */
export function openTargetClient(conn: ConnectionRow): postgres.Sql<Record<string, never>> {
  if (!conn.encryptedPostgresUrl) throw new NoPostgresUrlError();
  const url = decryptKey(conn.encryptedPostgresUrl);
  return postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: { application_name: "suparbase-sync-target" },
    onnotice: () => {},
  });
}

interface PgTarget {
  host: string;
  port: string;
  database: string;
}

function parsePgTarget(connectionString: string): PgTarget {
  // postgres://user:pass@host:port/db?params
  const u = new URL(connectionString);
  return {
    host: u.hostname.toLowerCase(),
    port: u.port || "5432",
    database: decodeURIComponent(u.pathname.replace(/^\//, "")).toLowerCase(),
  };
}

/**
 * Refuse to run when base and target resolve to the same physical database.
 * Compared on (host, port, database) after decrypting both URLs — and also
 * on exact URL equality as a belt-and-braces check.
 */
export function assertDistinctDatabases(base: ConnectionRow, target: ConnectionRow): void {
  if (base.id === target.id) {
    throw new SyncSafetyError("Base and target cannot be the same connection.");
  }
  if (!base.encryptedPostgresUrl || !target.encryptedPostgresUrl) {
    throw new NoPostgresUrlError();
  }
  const baseUrl = decryptKey(base.encryptedPostgresUrl);
  const targetUrl = decryptKey(target.encryptedPostgresUrl);
  if (baseUrl === targetUrl) {
    throw new SyncSafetyError("Base and target point at the same database.");
  }
  const b = parsePgTarget(baseUrl);
  const t = parsePgTarget(targetUrl);
  if (b.host === t.host && b.port === t.port && b.database === t.database) {
    throw new SyncSafetyError(
      `Base and target resolve to the same database (${t.host}:${t.port}/${t.database}). Refusing to sync.`,
    );
  }
}

/** Stable 63-bit advisory-lock key derived from a connection id. */
function advisoryKey(connectionId: string): bigint {
  const digest = createHash("sha1").update(`sync:${connectionId}`).digest();
  // top 8 bytes → unsigned, then mask to 63 bits so it fits a signed int8.
  const v = digest.readBigUInt64BE(0);
  return v & 0x7fffffffffffffffn;
}

/**
 * Run `fn` while holding an advisory lock on the target connection so two
 * syncs can't clobber the same database concurrently. Uses a session-level
 * `pg_try_advisory_lock`; releases in `finally`.
 */
export async function withTargetLock<T>(
  targetSql: postgres.Sql<Record<string, never>>,
  connectionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = advisoryKey(connectionId).toString();
  const [{ locked }] = await targetSql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS locked
  `;
  if (!locked) throw new SyncBusyError();
  try {
    return await fn();
  } finally {
    await targetSql`SELECT pg_advisory_unlock(${key}::bigint)`;
  }
}

/** The exact string the user must type to confirm a destructive (real) run. */
export function expectedConfirmation(target: ConnectionRow): string {
  return target.name;
}

export function verifyConfirmation(target: ConnectionRow, typed: string | undefined): boolean {
  return typeof typed === "string" && typed.trim() === expectedConfirmation(target);
}
