import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";

const MAX_TIMEOUT_MS = 15_000;

export class PgRestServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ServerQueryArgs {
  conn: ConnectionRow;
  /** Table name. */
  path: string;
  query: URLSearchParams;
  /** Pass `count=exact` to get a Content-Range count back. */
  prefer?: string;
  /** `${from}-${to}` for paged reads. */
  range?: string;
}

export interface ServerQueryResult<T> {
  data: T;
  totalCount: number | null;
}

/**
 * Read-only PostgREST GET from the user's Supabase project, executed from the
 * server (no client round-trip). Used by the AI chat tool runtime.
 */
export async function pgrestServerGet<T = unknown>(
  args: ServerQueryArgs,
): Promise<ServerQueryResult<T>> {
  const key = decryptKey(args.conn.encryptedKey);
  const url = `${args.conn.url}/rest/v1/${args.path}?${args.query.toString()}`;

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "X-Client-Info": "suparbase-ai-chat/1.1",
  };
  if (args.prefer) headers["Prefer"] = args.prefer;
  if (args.range) {
    headers["Range"] = args.range;
    headers["Range-Unit"] = "items";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new PgRestServerError(
      502,
      `Could not reach Supabase (${(e as Error).message ?? "network"}).`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new PgRestServerError(res.status, body.slice(0, 400) || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as T;
  const cr = res.headers.get("content-range");
  let totalCount: number | null = null;
  if (cr) {
    const slash = cr.lastIndexOf("/");
    if (slash >= 0) {
      const right = cr.slice(slash + 1);
      const n = Number(right);
      totalCount = Number.isFinite(n) ? n : null;
    }
  }
  return { data, totalCount };
}
