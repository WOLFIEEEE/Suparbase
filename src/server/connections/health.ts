import "server-only";
import postgres from "postgres";
import { and, count, desc, eq } from "drizzle-orm";
import { redact } from "@/lib/redact";
import { db } from "@/server/db";
import { decryptKey } from "@/server/crypto/vault";
import { sentryFindings, sentryScans } from "@/server/schema";
import type { ConnectionRow } from "@/server/schema/connections";
import { assertSafePostgresConnectionString } from "@/server/security/egress";

/**
 * On-demand health probe for one connection: is the PostgREST endpoint
 * reachable with the stored key, does the Direct Postgres URL still
 * connect, and how stale is the last Sentry scan. Read-only everywhere;
 * every error string is redacted before it leaves the server.
 */
export interface ConnectionHealth {
  rest: { ok: boolean; status: number | null; latencyMs: number | null; error: string | null };
  postgres: {
    configured: boolean;
    ok: boolean | null;
    latencyMs: number | null;
    error: string | null;
  };
  sentry: { lastScanAt: string | null; openCritical: number };
  checkedAt: string;
}

const PROBE_TIMEOUT_MS = 5_000;

async function checkRest(conn: ConnectionRow): Promise<ConnectionHealth["rest"]> {
  const t0 = Date.now();
  try {
    const key = decryptKey(conn.encryptedKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${conn.url.replace(/\/$/, "")}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: controller.signal,
        cache: "no-store",
      });
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - t0,
        error: res.ok ? null : `PostgREST answered ${res.status}.`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "Timed out after 5s." : (e as Error).message;
    return { ok: false, status: null, latencyMs: Date.now() - t0, error: redact(msg) };
  }
}

async function checkPostgres(conn: ConnectionRow): Promise<ConnectionHealth["postgres"]> {
  if (!conn.encryptedPostgresUrl) {
    return { configured: false, ok: null, latencyMs: null, error: null };
  }
  const t0 = Date.now();
  const url = await assertSafePostgresConnectionString(decryptKey(conn.encryptedPostgresUrl));
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 2,
    prepare: false,
    onnotice: () => {},
  });
  try {
    await sql`SELECT 1`;
    return { configured: true, ok: true, latencyMs: Date.now() - t0, error: null };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - t0,
      error: redact((e as Error).message ?? "Connection failed."),
    };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function checkSentry(
  connectionId: string,
): Promise<ConnectionHealth["sentry"]> {
  const [scan] = await db
    .select({ startedAt: sentryScans.startedAt })
    .from(sentryScans)
    .where(eq(sentryScans.connectionId, connectionId))
    .orderBy(desc(sentryScans.startedAt))
    .limit(1);
  const [critical] = await db
    .select({ n: count() })
    .from(sentryFindings)
    .where(
      and(
        eq(sentryFindings.connectionId, connectionId),
        eq(sentryFindings.severity, "critical"),
        eq(sentryFindings.status, "open"),
      ),
    );
  return {
    lastScanAt: scan?.startedAt.toISOString() ?? null,
    openCritical: critical?.n ?? 0,
  };
}

export async function checkConnectionHealth(conn: ConnectionRow): Promise<ConnectionHealth> {
  const [rest, pg, sentry] = await Promise.all([
    checkRest(conn),
    checkPostgres(conn),
    checkSentry(conn.id),
  ]);
  return { rest, postgres: pg, sentry, checkedAt: new Date().toISOString() };
}
