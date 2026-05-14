import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";

const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export class StorageApiError extends Error {
  status: number;
  category: string;
  constructor(category: string, message: string, status = 500) {
    super(message);
    this.category = category;
    this.status = status;
  }
}

function authHeaders(conn: ConnectionRow): Record<string, string> {
  const key = decryptKey(conn.encryptedKey);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "X-Client-Info": "suparbase-storage/1.3",
  };
}

async function call<T>(
  conn: ConnectionRow,
  method: string,
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: BodyInit;
    timeoutMs?: number;
    expectEmpty?: boolean;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  const url = `${conn.url}/storage/v1${path}`;
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
    throw new StorageApiError(
      "network",
      `Could not reach storage (${(e as Error).message ?? "network"}).`,
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
        : res.status === 413
        ? "validation"
        : "server";
    throw new StorageApiError(category, detail.slice(0, 400) || `Storage ${res.status}`, res.status);
  }

  if (init.expectEmpty || res.status === 204) {
    return undefined as T;
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export interface Bucket {
  id: string;
  name: string;
  owner: string | null;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface RawBucket {
  id?: string;
  name: string;
  owner?: string | null;
  public?: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

function normaliseBucket(r: RawBucket): Bucket {
  return {
    id: r.id ?? r.name,
    name: r.name,
    owner: r.owner ?? null,
    public: !!r.public,
    fileSizeLimit: r.file_size_limit ?? null,
    allowedMimeTypes: r.allowed_mime_types ?? null,
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

export async function listBuckets(conn: ConnectionRow): Promise<Bucket[]> {
  const raw = await call<RawBucket[]>(conn, "GET", "/bucket");
  return (raw ?? []).map(normaliseBucket).sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreateBucketInput {
  name: string;
  isPublic: boolean;
  fileSizeLimit?: number | null;
  allowedMimeTypes?: string[] | null;
}

export async function createBucket(conn: ConnectionRow, input: CreateBucketInput): Promise<Bucket> {
  await call<{ name: string }>(conn, "POST", "/bucket", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.name,
      name: input.name,
      public: input.isPublic,
      file_size_limit: input.fileSizeLimit ?? null,
      allowed_mime_types:
        input.allowedMimeTypes && input.allowedMimeTypes.length > 0
          ? input.allowedMimeTypes
          : null,
    }),
  });
  const all = await listBuckets(conn);
  const found = all.find((b) => b.name === input.name);
  if (!found) throw new StorageApiError("server", "Bucket was created but could not be reloaded.");
  return found;
}

export async function deleteBucket(conn: ConnectionRow, name: string, opts: { empty?: boolean } = {}): Promise<void> {
  if (opts.empty) {
    await call(conn, "POST", `/bucket/${encodeURIComponent(name)}/empty`, { expectEmpty: true });
  }
  await call(conn, "DELETE", `/bucket/${encodeURIComponent(name)}`, { expectEmpty: true });
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export interface StorageObject {
  name: string;
  isFolder: boolean;
  size: number | null;
  mimeType: string | null;
  lastModified: string | null;
  etag: string | null;
}

interface RawObject {
  name: string;
  id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
    eTag?: string;
    cacheControl?: string;
    lastModified?: string;
  } | null;
}

export interface ListObjectsResult {
  objects: StorageObject[];
  /** True when we asked for limit+1 and got back limit+1 — indicates more pages. */
  hasMore: boolean;
}

export async function listObjects(
  conn: ConnectionRow,
  bucket: string,
  prefix: string,
  limit: number,
  offset: number,
): Promise<ListObjectsResult> {
  // Supabase's list endpoint expects a JSON body, not URL params.
  const raw = await call<RawObject[]>(conn, "POST", `/object/list/${encodeURIComponent(bucket)}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: limit + 1,
      offset,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  const all = raw ?? [];
  const hasMore = all.length > limit;
  const sliced = hasMore ? all.slice(0, limit) : all;
  const objects: StorageObject[] = sliced.map((o) => {
    const isFolder = o.id === null;
    return {
      name: o.name,
      isFolder,
      size: o.metadata?.size ?? null,
      mimeType: o.metadata?.mimetype ?? null,
      lastModified: o.metadata?.lastModified ?? o.updated_at ?? o.created_at ?? null,
      etag: o.metadata?.eTag ?? null,
    };
  });
  return { objects, hasMore };
}

export async function uploadObject(
  conn: ConnectionRow,
  bucket: string,
  path: string,
  file: Blob,
  contentType: string,
  options: { upsert?: boolean } = {},
): Promise<void> {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "x-upsert": options.upsert ? "true" : "false",
    "Cache-Control": "max-age=3600",
  };
  await call(
    conn,
    options.upsert ? "PUT" : "POST",
    `/object/${encodeURIComponent(bucket)}/${safePath}`,
    {
      headers,
      body: file,
      expectEmpty: true,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    },
  );
}

export async function deleteObjects(
  conn: ConnectionRow,
  bucket: string,
  paths: string[],
): Promise<void> {
  await call(conn, "DELETE", `/object/${encodeURIComponent(bucket)}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
    expectEmpty: true,
  });
}

export interface SignedUrl {
  signedUrl: string;
  publicUrl: string | null;
}

export async function signObject(
  conn: ConnectionRow,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<SignedUrl> {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const data = await call<{ signedURL?: string; signedUrl?: string }>(
    conn,
    "POST",
    `/object/sign/${encodeURIComponent(bucket)}/${safePath}`,
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    },
  );
  const rel = data?.signedURL ?? data?.signedUrl ?? "";
  return {
    signedUrl: rel ? `${conn.url}/storage/v1${rel}` : "",
    publicUrl: null,
  };
}

export function publicUrl(conn: ConnectionRow, bucket: string, path: string): string {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return `${conn.url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safePath}`;
}
