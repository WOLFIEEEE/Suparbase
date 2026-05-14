import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import { checkWriteRate } from "@/server/proxy/ratelimit";

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
}

/**
 * Apply a write proposal the AI assistant drafted, AFTER the user has clicked
 * Apply in the chat UI. We re-validate inputs, hit the upstream PostgREST
 * directly with the decrypted key, and record an audit_log row with the same
 * before/after snapshot used by the row-history panel.
 */
export async function executeProposal({ userId, conn, proposal }: Args): Promise<ExecuteResult> {
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
    return finishWrite(res, "insert", { userId, conn, table: proposal.table });
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
    const res = await fetch(url, {
      method: "PATCH",
      headers: baseHeaders,
      body: JSON.stringify(proposal.patch),
    });
    return finishWrite(res, "update", { userId, conn, table: proposal.table });
  }

  if (proposal.kind === "proposed_delete") {
    const filterParams = buildFilters(proposal.filters);
    if (filterParams.toString() === "") {
      throw new ProposalExecutionError("validation", "Deletes require at least one filter.");
    }
    const url = `${conn.url}/rest/v1/${encodeURIComponent(proposal.table)}?${filterParams.toString()}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: baseHeaders,
    });
    return finishWrite(res, "delete", { userId, conn, table: proposal.table });
  }

  throw new ProposalExecutionError("validation", `Unknown proposal kind: ${proposal.kind}.`);
}

async function finishWrite(
  res: Response,
  verb: "insert" | "update" | "delete",
  meta: { userId: string; conn: ConnectionRow; table: string },
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

  void (async () => {
    try {
      for (const r of rows.slice(0, 10)) {
        const row = (r as Record<string, unknown>) ?? null;
        await auditWrite({
          userId: meta.userId,
          connectionId: meta.conn.id,
          schemaName: "public",
          tableName: meta.table,
          primaryKey: row,
          verb,
          httpStatus: res.status,
          beforeRow: verb === "delete" ? row : null,
          afterRow: verb !== "delete" ? row : null,
        });
      }
    } catch {
      /* audit failure should never break the response */
    }
  })();

  return { ok: true, applied, rows };
}
