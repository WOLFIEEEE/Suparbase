import "server-only";
import postgres from "postgres";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { NoPostgresUrlError } from "@/server/proxy/postgres";

const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const ROW_CAP = 1_000;
const VALUE_CHAR_CAP = 2_000;

export class SqlExecutionError extends Error {
  category: "validation" | "rls" | "server" | "no_postgres_url";
  detail?: string;
  position?: number;
  hint?: string;
  constructor(
    category: SqlExecutionError["category"],
    message: string,
    extra: { detail?: string; position?: number; hint?: string } = {},
  ) {
    super(message);
    this.category = category;
    this.detail = extra.detail;
    this.position = extra.position;
    this.hint = extra.hint;
  }
}

export interface SqlColumn {
  name: string;
  /** OID, e.g. 23 = int4, 25 = text. */
  typeOid: number;
}

export interface SqlExecuteResult {
  columns: SqlColumn[];
  rows: unknown[][];
  rowCount: number;
  /** True if `rows` was truncated to ROW_CAP. */
  truncated: boolean;
  elapsedMs: number;
  /** PostgreSQL command tag, e.g. "SELECT" / "UPDATE 4". */
  command: string;
  notices: string[];
  /** True when the query ran inside a read-only transaction. */
  readOnly: boolean;
}

export interface SqlExecuteOptions {
  conn: ConnectionRow;
  sql: string;
  readOnly: boolean;
  statementTimeoutMs?: number;
  /**
   * Positional parameters for $1..$N placeholders. Bound via postgres.js
   * so values are never string-concatenated into the SQL.
   */
  params?: unknown[];
}

/**
 * Execute a free-form SQL statement against the user's project via the
 * direct Postgres URL stored on the connection (same channel as RLS
 * introspection). Always runs inside a transaction:
 *
 * - read-only mode: `BEGIN READ ONLY` so any write statement fails with
 *   Postgres's own "cannot execute X in a read-only transaction" error.
 * - write mode: regular transaction, committed on success.
 *
 * Caps results at ROW_CAP rows and serialises each cell with a hard
 * character cap so a `SELECT large_blob` can't crash the chat panel.
 */
export async function executeSql(opts: SqlExecuteOptions): Promise<SqlExecuteResult> {
  if (!opts.conn.encryptedPostgresUrl) throw new NoPostgresUrlError();
  if (!opts.sql.trim()) {
    throw new SqlExecutionError("validation", "SQL is empty.");
  }

  const url = decryptKey(opts.conn.encryptedPostgresUrl);
  const timeoutMs = clamp(
    opts.statementTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    100,
    MAX_TIMEOUT_MS,
  );

  const notices: string[] = [];

  const sql = postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
    onnotice: (n) => {
      const msg = `${n.severity ?? "NOTICE"}: ${n.message ?? ""}`.trim();
      if (msg) notices.push(msg);
    },
  });

  const t0 = Date.now();
  try {
    let captured: postgres.RowList<postgres.Row[]> | null = null;
    let capturedError: unknown = null;

    if (opts.readOnly) {
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe("SET TRANSACTION READ ONLY");
          await tx`SET LOCAL statement_timeout = ${timeoutMs}`;
          try {
            captured = await tx.unsafe(opts.sql, opts.params as never);
          } catch (e) {
            capturedError = e;
          }
          // Always roll back to keep read-only semantics extra-safe: even if
          // Postgres ever permitted a side effect, the COMMIT never lands.
          throw new Rollback();
        });
      } catch (e) {
        if (!(e instanceof Rollback)) throw e;
      }
    } else {
      try {
        await sql.begin(async (tx) => {
          await tx`SET LOCAL statement_timeout = ${timeoutMs}`;
          captured = await tx.unsafe(opts.sql, opts.params as never);
        });
      } catch (e) {
        capturedError = e;
      }
    }

    if (capturedError) throw capturedError;

    const elapsedMs = Date.now() - t0;
    const rowList = captured ?? ([] as unknown as postgres.RowList<postgres.Row[]>);
    return shapeResult(rowList, notices, elapsedMs, opts.readOnly);
  } catch (e) {
    const wrapped = wrapPgError(e);
    if (wrapped) throw wrapped;
    throw new SqlExecutionError("server", (e as Error).message ?? "Unknown error.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

function shapeResult(
  rows: postgres.RowList<postgres.Row[]>,
  notices: string[],
  elapsedMs: number,
  readOnly: boolean,
): SqlExecuteResult {
  // `rows.columns` may be undefined when the query returned no result set
  // (e.g. SET, BEGIN). Fall back to an empty schema in that case.
  const cols: SqlColumn[] = Array.isArray(rows.columns)
    ? rows.columns.map((c) => ({ name: c.name, typeOid: c.type }))
    : [];

  const visible = rows.slice(0, ROW_CAP);
  const truncated = rows.length > ROW_CAP;

  const data = visible.map((row) => {
    if (cols.length > 0) {
      return cols.map((c) => safeCell((row as Record<string, unknown>)[c.name]));
    }
    // Fallback: iterate over the row's own keys.
    return Object.values(row as Record<string, unknown>).map((v) => safeCell(v));
  });

  return {
    columns: cols,
    rows: data,
    rowCount: rows.count ?? rows.length,
    truncated,
    elapsedMs,
    command: rows.command ?? "",
    notices,
    readOnly,
  };
}

function safeCell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    return v.length > VALUE_CHAR_CAP ? v.slice(0, VALUE_CHAR_CAP) + "…" : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const len = (v as Buffer | Uint8Array).byteLength;
    return `\\x${len <= 32 ? Buffer.from(v as Uint8Array).toString("hex") : `<${len} bytes>`}`;
  }
  try {
    const s = JSON.stringify(v);
    return s.length > VALUE_CHAR_CAP ? s.slice(0, VALUE_CHAR_CAP) + "…" : s;
  } catch {
    return String(v);
  }
}

class Rollback extends Error {
  constructor() {
    super("rollback");
    this.name = "Rollback";
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

interface PostgresError {
  code?: string;
  message?: string;
  detail?: string;
  hint?: string;
  position?: string | number;
  severity?: string;
}

function wrapPgError(err: unknown): SqlExecutionError | null {
  if (!err || typeof err !== "object") return null;
  const e = err as PostgresError;
  const message = e.message ?? "Database error.";
  const detail = e.detail;
  const hint = e.hint;
  const position =
    typeof e.position === "string"
      ? Number(e.position)
      : typeof e.position === "number"
      ? e.position
      : undefined;

  // 25006: cannot execute X in a read-only transaction
  // 25008: held cursor requires same isolation level
  if (e.code === "25006") {
    return new SqlExecutionError(
      "rls",
      "Read-only mode is on: this statement writes data. Toggle write mode if you really want to run it.",
      { detail, hint, position },
    );
  }
  // Statement timeout
  if (e.code === "57014") {
    return new SqlExecutionError("server", "Statement timed out. Increase the timeout or narrow the query.", {
      detail,
      hint,
      position,
    });
  }
  // Authorisation / RLS
  if (e.code === "42501") {
    return new SqlExecutionError("rls", message, { detail, hint, position });
  }
  // Syntax + most user-fault errors → validation
  if (e.code && /^4[2|3]/.test(e.code)) {
    return new SqlExecutionError("validation", message, { detail, hint, position });
  }
  if (e.code) {
    return new SqlExecutionError("server", message, { detail, hint, position });
  }
  return new SqlExecutionError("server", message, { detail, hint, position });
}
