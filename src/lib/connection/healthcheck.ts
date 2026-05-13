import type { Connection } from "./store";

/**
 * Lightweight credential check used at app boot for persisted connections.
 *
 * - 401 / 403 → revoked or wrong key. Caller should clear and bounce to /.
 * - network failure → leave the connection in place (the user may be offline).
 * - any 2xx → good to proceed.
 */
export type HealthcheckResult =
  | { status: "ok" }
  | { status: "unauthorized" }
  | { status: "transient" };

export async function pingConnection(conn: Connection): Promise<HealthcheckResult> {
  let res: Response;
  try {
    res = await fetch(`${conn.url}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: conn.key,
        Authorization: `Bearer ${conn.key}`,
        Accept: "application/openapi+json",
      },
      // We only need the status code; OpenAPI bodies are small, but bail fast.
      cache: "no-store",
    });
  } catch {
    return { status: "transient" };
  }
  if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
  if (res.status >= 200 && res.status < 500) return { status: "ok" };
  return { status: "transient" };
}
