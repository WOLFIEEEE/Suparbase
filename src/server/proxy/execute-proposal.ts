import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import { checkWriteRate } from "@/server/proxy/ratelimit";
import { introspectConnection } from "@/server/schema-introspect";
import { attachToSession } from "@/server/sentry/sessions";

const ALLOWED_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);

export interface FilterIn {
  column: string;
  op: string;
  value: unknown;
}

export interface ExecuteProposal {
  kind: "proposed_update" | "proposed_insert" | "proposed_delete";
  table: string;
  filters?: FilterIn[];
  patch?: Record<string, unknown>;
  values?: Record<string, unknown>;
}

export interface ExecuteResult {
  ok: boolean;
  applied: number;
  rows?: unknown[];
  message?: string;
}

export class ProposalExecutionError extends Error {
  status: number;
  category: string;
  constructor(category: string, message: string, status = 400) {
    super(message);
    this.category = category;
    this.status = status;
  }
}

function encodeValue(op: string, value: unknown): string {
  if (op === "in") {
    const arr = Array.isArray(value) ? value : [value];
    return `(${arr.map((v) => encodeURIComponent(String(v))).join(",")})`;
  }
  if (op === "is") {
    if (value === null) return "null";
    return String(value);
  }
  return String(value);
}

function buildFilters(filters: FilterIn[] | undefined): URLSearchParams {
  const q = new URLSearchParams();
  if (!filters) return q;
  for (const f of filters) {
    if (!ALLOWED_OPS.has(f.op)) {
      throw new ProposalExecutionError("validation", `Unsupported operator "${f.op}".`);
    }
    q.append(f.column, `${f.op}.${encodeValue(f.op, f.value)}`);
  }
  return q;
}

interface Args {
  userId: string;
  conn: ConnectionRow;
  proposal: ExecuteProposal;
  userAgent?: string | null;
}

/**
 * Apply a write proposal the AI assistant drafted, AFTER the user has clicked
 * Apply in the chat UI. We re-validate inputs, hit the upstream PostgREST
 * directly with the decrypted key, and record an audit_log row with the same
 * before/after snapshot used by the row-history panel.
 */
export async function executeProposal({ userId, conn, proposal, userAgent }: Args): Promise<ExecuteResult> {
  const limit = checkWriteRate(userId);
  if (!limit.allowed) {
    throw new ProposalExecutionError("rate_limited", "Too many writes: try again shortly.", 429);
  }

  if (!proposal.table || typeof proposal.table !== "string") {
    throw new ProposalExecutionError("validation", "Missing table.");
  }

  const key = decryptKey(conn.encryptedKey);
  const baseHeaders: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
    "X-Client-Info": "suparbase-ai-execute/1.2",
  };
  const schema = await introspectConnection(conn);
  const table = schema.tables.find((candidate) => candidate.name === proposal.table);
  if (!table || table.kind !== "table") {
    throw new ProposalExecutionError("validation", "Proposal target is not a writable table.");
  }

  if (proposal.kind === "proposed_insert") {
    if (!proposal.values || typeof proposal.values !== "object") {
      throw new ProposalExecutionError("validation", "Missing values for insert.");
    }
    const url = `${conn.url}/rest/v1/${encodeURIComponent(proposal.table)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(proposal.values),
    });
    return finishWrite(res, "insert", {
      userId,
      conn,
      table: proposal.table,
      primaryKey: table.primaryKey,
      beforeRows: [],
      userAgent,
    });
  }

  if (proposal.kind === "proposed_update") {
    if (!proposal.patch || typeof proposal.patch !== "object") {
      throw new ProposalExecutionError("validation", "Missing patch for update.");
    }
    const filterParams = buildFilters(proposal.filters);
    if (filterParams.toString() === "") {
      throw new ProposalExecutionError("validation", "Updates require at least one filter.");
    }
    const url = `${conn.url}/rest/v1/${encodeURIComponent(proposal.table)}?${filterParams.toString()}`;
    const beforeRows = await selectBeforeRows(url, baseHeaders);
    const res = await fetch(url, {
      method: "PATCH",
      headers: baseHeaders,
      body: JSON.stringify(proposal.patch),
    });
    return finishWrite(res, "update", {
      userId,
      conn,
      table: proposal.table,
      primaryKey: table.primaryKey,
      beforeRows,
      userAgent,
    });
  }

  if (proposal.kind === "proposed_delete") {
    const filterParams = buildFilters(proposal.filters);
    if (filterParams.toString() === "") {
      throw new ProposalExecutionError("validation", "Deletes require at least one filter.");
    }
    const url = `${conn.url}/rest/v1/${encodeURIComponent(proposal.table)}?${filterParams.toString()}`;
    const beforeRows = await selectBeforeRows(url, baseHeaders);
    const res = await fetch(url, {
      method: "DELETE",
      headers: baseHeaders,
    });
    return finishWrite(res, "delete", {
      userId,
      conn,
      table: proposal.table,
      primaryKey: table.primaryKey,
      beforeRows,
      userAgent,
    });
  }

  throw new ProposalExecutionError("validation", `Unknown proposal kind: ${proposal.kind}.`);
}

async function finishWrite(
  res: Response,
  verb: "insert" | "update" | "delete",
  meta: {
    userId: string;
    conn: ConnectionRow;
    table: string;
    primaryKey: string[];
    beforeRows: Array<Record<string, unknown>>;
    userAgent?: string | null;
  },
): Promise<ExecuteResult> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ProposalExecutionError("server", `Upstream ${res.status}: ${detail.slice(0, 200)}`, res.status);
  }

  let rows: unknown[] = [];
  try {
    rows = (await res.json()) as unknown[];
  } catch {
    rows = [];
  }
  const applied = Array.isArray(rows) ? rows.length : 0;

  const session = await attachToSession({
    userId: meta.userId,
    connectionId: meta.conn.id,
    userAgent: meta.userAgent ?? null,
    schemaName: "public",
    tableName: meta.table,
  });
  const resultRows = rows.filter(
    (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
  );
  const beforeByKey = new Map(
    meta.beforeRows.map((row) => [stableKey(pickPrimaryKey(row, meta.primaryKey)), row]),
  );
  await Promise.all(
    resultRows.map((row) => {
      const primaryKey = pickPrimaryKey(row, meta.primaryKey);
      const beforeRow = verb === "insert"
        ? null
        : beforeByKey.get(stableKey(primaryKey)) ?? (verb === "delete" ? row : null);
      return auditWrite({
        userId: meta.userId,
        connectionId: meta.conn.id,
        schemaName: "public",
        tableName: meta.table,
        primaryKey,
        verb,
        httpStatus: res.status,
        beforeRow,
        afterRow: verb === "delete" ? null : row,
        sessionId: session?.id ?? null,
      });
    }),
  );

  return { ok: true, applied, rows };
}

async function selectBeforeRows(
  url: string,
  headers: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const snapshotUrl = new URL(url);
  snapshotUrl.searchParams.set("select", "*");
  snapshotUrl.searchParams.set("limit", "501");
  const response = await fetch(snapshotUrl, { headers });
  if (!response.ok) {
    throw new ProposalExecutionError(
      "server",
      "Write stopped because its before-state could not be captured.",
      502,
    );
  }
  const value = await response.json() as unknown;
  const rows = Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  if (rows.length > 500) {
    throw new ProposalExecutionError(
      "validation",
      "AI proposals may affect at most 500 rows. Narrow the filters and try again.",
    );
  }
  return rows;
}

function pickPrimaryKey(
  row: Record<string, unknown>,
  columns: string[],
): Record<string, unknown> | null {
  if (columns.length === 0) return null;
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

function stableKey(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
