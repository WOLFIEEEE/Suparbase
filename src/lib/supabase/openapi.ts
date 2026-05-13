import type { Connection } from "@/lib/connection/store";
import { AppError } from "@/lib/api/errors";

export interface OpenAPIProperty {
  type?: string;
  format?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  maxLength?: number;
  items?: { type?: string; format?: string };
}

export interface OpenAPIDefinition {
  type?: "object";
  required?: string[];
  properties?: Record<string, OpenAPIProperty>;
}

export interface OpenAPIPathItem {
  get?: unknown;
  post?: unknown;
  patch?: unknown;
  delete?: unknown;
}

export interface OpenAPIDoc {
  swagger?: string;
  basePath?: string;
  host?: string;
  definitions?: Record<string, OpenAPIDefinition>;
  paths?: Record<string, OpenAPIPathItem>;
}

export async function fetchOpenAPI(conn: Connection): Promise<OpenAPIDoc> {
  const url = `${conn.url}/rest/v1/`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: conn.key,
        Authorization: `Bearer ${conn.key}`,
        Accept: "application/openapi+json",
      },
    });
  } catch (cause) {
    throw new AppError("network", "Could not reach this Supabase host.", { cause });
  }

  if (res.status === 401) {
    throw new AppError("unauthorized", "This key was rejected by your project.");
  }
  if (res.status === 403) {
    throw new AppError("forbidden", "This key cannot access the schema (likely RLS).");
  }
  if (res.status === 404) {
    throw new AppError("not_found", "REST endpoint not found at this URL.");
  }
  if (res.status >= 500) {
    throw new AppError("server", `Supabase responded with ${res.status}.`);
  }
  if (!res.ok) {
    throw new AppError("server", `Unexpected status ${res.status} from Supabase.`);
  }

  const doc = (await res.json()) as OpenAPIDoc;
  if (!doc.definitions) {
    throw new AppError("server", "OpenAPI document missing `definitions`.");
  }
  return doc;
}
