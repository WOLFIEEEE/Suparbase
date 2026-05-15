import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { connections } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import { attachToSession } from "@/server/sentry/sessions";
import { checkWriteRate } from "./ratelimit";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

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
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);
  const conn = rows[0];
  if (!conn || conn.userId !== userId) {
    return jsonError(404, "not_found", "Connection not found.");
  }

  const isWrite = WRITE_VERBS.has(method);
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

  // Body: for writes, forward as-is.
  const body = isWrite ? await readBoundedBody(request) : undefined;
  if (body instanceof Response) return body; // bounded reader returned an error response

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
      // streaming uploads
      // @ts-expect-error - duplex is a valid option but missing from RequestInit type
      duplex: body ? "half" : undefined,
      redirect: "manual",
    });
  } catch {
    return jsonError(502, "network", "Could not reach the Supabase host.");
  }

  // For audit purposes on inserts we need to peek at the upstream body. Clone
  // the upstream Response BEFORE we hand its body off to the outgoing Response.
  const auditClone =
    isWrite && upstream.status >= 200 && upstream.status < 300 ? upstream.clone() : null;

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

  // Audit log fires asynchronously after we already have the outgoing response
  // ready: never blocks the user-visible reply.
  if (auditClone) {
    // Capture the incoming User-Agent now (we can't read it later, the
    // request object is gone by the time the async block runs).
    const userAgent = request.headers.get("user-agent");
    const tableName = pathParts[0] ?? "";
    void (async () => {
      const [auditMeta, session] = await Promise.all([
        extractAuditFromRequest({
          method,
          search: url.search,
          cloned: auditClone,
        }),
        attachToSession({
          userId,
          connectionId,
          userAgent,
          schemaName: "public",
          tableName,
        }),
      ]);
      await auditWrite({
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
      });
      await touch(connectionId);
    })();
  }

  return out;
}

async function readBoundedBody(req: Request): Promise<BodyInit | Response | undefined> {
  if (!req.body) return undefined;
  // node-fetch / undici accept ReadableStream directly with duplex.
  // We don't need to buffer; rely on Content-Length check above + node http server cap.
  return req.body;
}

interface AuditMeta {
  primaryKey: Record<string, unknown> | null;
  verb: "insert" | "update" | "delete";
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
}

async function extractAuditFromRequest(args: {
  method: string;
  search: string;
  cloned: Response;
}): Promise<AuditMeta> {
  const verb: AuditMeta["verb"] =
    args.method === "POST" ? "insert" : args.method === "DELETE" ? "delete" : "update";

  // Pull the upstream body if it carries a row representation (client used
  // `Prefer: return=representation`). Whether that snapshot represents the
  // BEFORE or AFTER state depends on the verb.
  let row: Record<string, unknown> | null = null;
  try {
    if ((args.cloned.headers.get("content-type") ?? "").includes("application/json")) {
      const text = await args.cloned.text();
      const parsed = safeParseJson(text);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0]) {
        row = parsed[0] as Record<string, unknown>;
      } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        row = parsed as Record<string, unknown>;
      }
    }
  } catch {
    // audit is best-effort
  }

  if (verb === "insert") {
    return {
      primaryKey: row,
      verb,
      beforeRow: null,
      afterRow: row,
    };
  }

  const pk = extractPkFromFilters(args.search);
  if (verb === "update") {
    return { primaryKey: pk, verb, beforeRow: null, afterRow: row };
  }
  // delete
  return { primaryKey: pk, verb, beforeRow: row, afterRow: null };
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
