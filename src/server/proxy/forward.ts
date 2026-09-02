import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { connections } from "@/server/schema/connections";
import { getConnectionAccess, roleAtLeast } from "@/server/connections/repo";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import { attachToSession } from "@/server/sentry/sessions";
import { introspectConnection } from "@/server/schema-introspect";
import type { ConnectionRow } from "@/server/schema/connections";
import { log } from "@/server/log";
import { checkWriteRate } from "./ratelimit";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REVERSIBLE_ROWS = 500;

// Headers we let the client influence. Everything else (Authorization,
// Cookie, X-Forwarded-*, etc.) is stripped at the boundary.
const ALLOWED_INBOUND_HEADERS = new Set([
  "accept",
  "content-type",
  "content-range",
  "range",
  "prefer",
]);

const WRITE_VERBS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

interface ProxyArgs {
  request: Request;
  method: string;
  connectionId: string;
  userId: string;
  pathParts: string[]; // ["posts"] or ["rpc", "fn_name"], etc.
}

export async function proxyForward({ request, method, connectionId, userId, pathParts }: ProxyArgs): Promise<Response> {
  const access = await getConnectionAccess(userId, connectionId);
  if (!access) {
    return jsonError(404, "not_found", "Connection not found.");
  }

  const isWrite = WRITE_VERBS.has(method);
  if (isWrite && !roleAtLeast(access.role, "editor")) {
    return jsonError(403, "forbidden", "Editor access is required for data writes.");
  }
  const conn = access.conn;
  if (isWrite) {
    const limit = checkWriteRate(userId);
    if (!limit.allowed) {
      return jsonError(429, "rate_limited", "Too many writes: try again shortly.", {
        "Retry-After": String(limit.retryAfterSeconds),
      });
    }
  }

  // Body size guard for writes.
  if (isWrite) {
    const lenHeader = request.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
      return jsonError(413, "validation", "Request body too large.");
    }
  }

  let plaintextKey: string;
  try {
    plaintextKey = decryptKey(conn.encryptedKey);
  } catch {
    return jsonError(500, "server", "Unable to decrypt credential. Check encryption key configuration.");
  }

  // Build upstream URL: ${conn.url}/rest/v1/${path}${search}
  const url = new URL(request.url);
  const targetPath = pathParts.join("/");
  const upstreamUrl = `${conn.url}/rest/v1/${targetPath}${url.search}`;

  // Headers: copy allowed; inject auth.
  const upstreamHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (ALLOWED_INBOUND_HEADERS.has(key.toLowerCase())) upstreamHeaders.set(key, value);
  });
  upstreamHeaders.set("apikey", plaintextKey);
  upstreamHeaders.set("Authorization", `Bearer ${plaintextKey}`);
  upstreamHeaders.set("X-Client-Info", "suparbase-saas/0.2");
  if (isWrite && pathParts[0] !== "rpc") {
    const preferences = (upstreamHeaders.get("prefer") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith("return="));
    preferences.push("return=representation");
    upstreamHeaders.set("Prefer", preferences.join(","));
  }

  // Body: for writes, forward as-is.
  const body = isWrite ? await readBoundedBody(request) : undefined;
  if (body instanceof Response) return body; // bounded reader returned an error response

  let writeContext: WriteContext | null = null;
  if (isWrite) {
    try {
      writeContext = await captureWriteContext({
        conn,
        plaintextKey,
        method,
        tableName: pathParts[0] ?? "",
        search: url.search,
      });
    } catch (e) {
      return jsonError(
        409,
        "audit_required",
        e instanceof Error ? e.message : "Could not capture a reversible write snapshot.",
      );
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
      redirect: "manual",
    });
  } catch {
    return jsonError(502, "network", "Could not reach the Supabase host.");
  }

  // For audit purposes on inserts we need to peek at the upstream body. Clone
  // the upstream Response BEFORE we hand its body off to the outgoing Response.
  const auditClone =
    isWrite && upstream.status >= 200 && upstream.status < 300 ? upstream.clone() : null;

  // Persist audit state before returning the successful mutation response.
  if (auditClone && writeContext) {
    const userAgent = request.headers.get("user-agent");
    const tableName = pathParts[0] === "rpc"
      ? `rpc/${pathParts.slice(1).join("/")}`
      : pathParts[0] ?? "";
    try {
      const [auditRows, session] = await Promise.all([
        buildAuditRows({ method, cloned: auditClone, body, context: writeContext }),
        attachToSession({
          userId,
          connectionId,
          userAgent,
          schemaName: "public",
          tableName,
        }),
      ]);
      const persisted = await Promise.all(
        auditRows.map((auditMeta) =>
          auditWrite({
            userId,
            connectionId,
            schemaName: "public",
            tableName,
            primaryKey: auditMeta.primaryKey,
            verb: auditMeta.verb,
            httpStatus: upstream.status,
            beforeRow: auditMeta.beforeRow,
            afterRow: auditMeta.afterRow,
            sessionId: session?.id ?? null,
          }),
        ),
      );
      if (persisted.some((ok) => !ok)) {
        log.error("one or more audit rows failed after upstream mutation", {
          connectionId,
          tableName,
          expected: auditRows.length,
        });
      }
      await touch(connectionId);
    } catch (e) {
      log.error("audit capture failed after upstream mutation", {
        connectionId,
        tableName,
        err: e,
      });
    }
  }

  // Build response: forward the body stream + relevant headers + status.
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) responseHeaders.set("content-range", contentRange);
  // Cache control: tell browsers and intermediates not to store responses
  // containing user data.
  responseHeaders.set("cache-control", "no-store");

  const out = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  return out;
}

async function readBoundedBody(req: Request): Promise<BodyInit | Response | undefined> {
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return jsonError(413, "validation", "Request body too large.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

interface AuditMeta {
  primaryKey: Record<string, unknown> | null;
  verb: "insert" | "update" | "delete";
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
}

interface WriteContext {
  primaryKey: string[];
  beforeRows: Array<Record<string, unknown>>;
  fallbackKey: Record<string, unknown> | null;
}

async function captureWriteContext(args: {
  conn: ConnectionRow;
  plaintextKey: string;
  method: string;
  search: string;
  tableName: string;
}): Promise<WriteContext> {
  if (!args.tableName || args.tableName === "rpc") {
    return { primaryKey: [], beforeRows: [], fallbackKey: extractPkFromFilters(args.search) };
  }
  const schema = await introspectConnection(args.conn);
  const table = schema.tables.find((candidate) => candidate.name === args.tableName);
  const primaryKey = table?.primaryKey ?? [];
  const fallbackKey = extractPkFromFilters(args.search);
  if (args.method === "POST") return { primaryKey, beforeRows: [], fallbackKey };

  const query = new URLSearchParams(args.search.startsWith("?") ? args.search.slice(1) : args.search);
  for (const key of ["select", "order", "limit", "offset", "range"]) query.delete(key);
  query.set("select", "*");
  query.set("limit", String(MAX_REVERSIBLE_ROWS + 1));
  const response = await fetch(
    `${args.conn.url}/rest/v1/${encodeURIComponent(args.tableName)}?${query.toString()}`,
    {
      headers: {
        apikey: args.plaintextKey,
        Authorization: `Bearer ${args.plaintextKey}`,
        Accept: "application/json",
      },
      redirect: "manual",
    },
  );
  if (!response.ok) {
    throw new Error("Write was stopped because its before-state could not be captured for audit and undo.");
  }
  const beforeRows = rowsFromUnknown(await response.json().catch(() => []));
  if (beforeRows.length > MAX_REVERSIBLE_ROWS) {
    throw new Error(
      `Write would affect more than ${MAX_REVERSIBLE_ROWS} rows. Use the reviewed bulk workflow instead.`,
    );
  }
  return { primaryKey, beforeRows, fallbackKey };
}

async function buildAuditRows(args: {
  method: string;
  cloned: Response;
  body: BodyInit | undefined;
  context: WriteContext;
}): Promise<AuditMeta[]> {
  const verb: AuditMeta["verb"] =
    args.method === "POST" ? "insert" : args.method === "DELETE" ? "delete" : "update";
  const returnedRows = (args.cloned.headers.get("content-type") ?? "").includes("application/json")
    ? rowsFromUnknown(safeParseJson(await args.cloned.text().catch(() => "")))
    : [];
  const patch = bodyJson(args.body);

  if (verb === "insert") {
    const rows = returnedRows.length > 0 ? returnedRows : rowsFromUnknown(patch);
    return (rows.length > 0 ? rows : [null]).map((row) => ({
      primaryKey: row ? pickPrimaryKey(row, args.context.primaryKey) ?? args.context.fallbackKey : null,
      verb,
      beforeRow: null,
      afterRow: row,
    }));
  }

  if (verb === "delete") {
    const rows = args.context.beforeRows.length > 0 ? args.context.beforeRows : returnedRows;
    return (rows.length > 0 ? rows : [null]).map((row) => ({
      primaryKey: row ? pickPrimaryKey(row, args.context.primaryKey) ?? args.context.fallbackKey : args.context.fallbackKey,
      verb,
      beforeRow: row,
      afterRow: null,
    }));
  }

  const afterByKey = new Map(
    returnedRows.map((row) => [stableKey(pickPrimaryKey(row, args.context.primaryKey)), row]),
  );
  const patchObject = patch && typeof patch === "object" && !Array.isArray(patch)
    ? patch as Record<string, unknown>
    : {};
  const beforeRows = args.context.beforeRows;
  return (beforeRows.length > 0 ? beforeRows : [null]).map((beforeRow) => {
    const primaryKey = beforeRow
      ? pickPrimaryKey(beforeRow, args.context.primaryKey) ?? args.context.fallbackKey
      : args.context.fallbackKey;
    const afterRow = beforeRow
      ? afterByKey.get(stableKey(primaryKey)) ?? { ...beforeRow, ...patchObject }
      : returnedRows[0] ?? null;
    return { primaryKey, verb, beforeRow, afterRow };
  });
}

function rowsFromUnknown(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
    );
  }
  return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
}

function bodyJson(body: BodyInit | undefined): unknown {
  if (!(body instanceof Uint8Array)) return null;
  return safeParseJson(new TextDecoder().decode(body));
}

function pickPrimaryKey(
  row: Record<string, unknown>,
  columns: string[],
): Record<string, unknown> | null {
  if (columns.length === 0) return null;
  const key: Record<string, unknown> = {};
  for (const column of columns) {
    if (!(column in row)) return null;
    key[column] = row[column];
  }
  return key;
}

function stableKey(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function extractPkFromFilters(search: string): Record<string, unknown> | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pk: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset") continue;
    // PostgREST filter syntax: column=op.value (e.g. id=eq.123). We only keep eq.* for PK.
    const eq = value.startsWith("eq.") ? value.slice(3) : null;
    if (eq != null) pk[key] = eq;
  }
  return Object.keys(pk).length > 0 ? pk : null;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function touch(connectionId: string): Promise<void> {
  try {
    await db
      .update(connections)
      .set({ lastUsedAt: new Date() })
      .where(eq(connections.id, connectionId));
  } catch {
    // non-fatal
  }
}

export function jsonError(
  status: number,
  category: string,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ category, message }), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
