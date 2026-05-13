import { AppError, type ErrorCategory, toAppError } from "@/lib/errors";

export interface PgRestRequest {
  connectionId: string;
  path: string;
  query?: URLSearchParams;
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface PgRestResponse<T> {
  data: T;
  count: number | null;
  rangeUnit: string | null;
  status: number;
}

function buildUrl(req: PgRestRequest): string {
  const qs = req.query ? `?${req.query.toString()}` : "";
  return `/api/v/${encodeURIComponent(req.connectionId)}/rest/${req.path}${qs}`;
}

function parseCount(header: string | null): number | null {
  if (!header) return null;
  // PostgREST returns `Content-Range: 0-24/200` or `*/200` or `*/*`.
  const slash = header.lastIndexOf("/");
  if (slash < 0) return null;
  const right = header.slice(slash + 1);
  if (right === "*") return null;
  const n = Number(right);
  return Number.isFinite(n) ? n : null;
}

export async function pgrest<T = unknown>(req: PgRestRequest): Promise<PgRestResponse<T>> {
  const url = buildUrl(req);
  const method = req.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(req.body !== undefined && req.body !== null ? { "Content-Type": "application/json" } : {}),
        ...(req.headers ?? {}),
      },
      body:
        req.body === undefined || req.body === null
          ? undefined
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body),
      signal: req.signal,
    });
  } catch (cause) {
    throw new AppError("network", "Could not reach the server.", { cause });
  }

  const contentType = res.headers.get("content-type") ?? "";
  let payload: unknown = null;
  if (res.status !== 204 && contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    // Our API + the proxy return { category, message } JSON on errors.
    if (payload && typeof payload === "object" && "category" in payload) {
      const e = payload as { category: ErrorCategory; message: string; columnHint?: string; field?: string };
      throw new AppError(e.category, e.message, { columnHint: e.columnHint });
    }
    // Upstream PostgREST may return its own shape — let toAppError translate.
    throw toAppError({ status: res.status, ...(payload as object) });
  }

  return {
    data: payload as T,
    count: parseCount(res.headers.get("content-range")),
    rangeUnit: res.headers.get("range-unit"),
    status: res.status,
  };
}
