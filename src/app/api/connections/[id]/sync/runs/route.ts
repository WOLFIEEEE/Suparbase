import { NextResponse, type NextRequest } from "next/server";
import { redact } from "@/lib/redact";
import { auth } from "@/server/auth";
import { getConnectionAccess, getConnectionForRole, requireRole } from "@/server/connections/repo";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { createRun, getProfile, getRun, listRuns, updateRun } from "@/server/sync/repo";
import { startRunSchema } from "@/server/sync/validate";
import { executeSyncRun } from "@/server/sync/runner";
import { verifyConfirmation } from "@/server/sync/safety";
import type { SyncRunStats } from "@/server/schema/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A full-replace sync of a large database can run for many minutes. Suparbase
// deploys on long-lived Node (Coolify), where this is an advisory hint rather
// than a hard serverless ceiling; raised well above the default so a big sync
// isn't cut off mid-transaction.
export const maxDuration = 3600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const runs = await listRuns(session.user.id, id);
  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to run a sync." },
      { status: 403 },
    );
  }

  const parsed = startRunSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { profileId, dryRun, confirm } = parsed.data;

  const profile = await getProfile(session.user.id, profileId);
  if (!profile || profile.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }

  // A real (destructive) run truncates the target — require the user to type
  // the target's name. Dry runs write nothing, so no confirmation needed.
  if (!dryRun && !verifyConfirmation(access.conn, confirm)) {
    return NextResponse.json(
      {
        category: "validation",
        message: `Type the target connection name ("${access.conn.name}") to confirm a full-replace sync.`,
      },
      { status: 400 },
    );
  }

  const base = await getConnectionForRole(session.user.id, profile.baseConnectionId, "viewer");
  if (!base) {
    return NextResponse.json(
      { category: "validation", message: "Base connection not found or not accessible." },
      { status: 400 },
    );
  }
  if (!base.encryptedPostgresUrl || !access.conn.encryptedPostgresUrl) {
    return NextResponse.json(
      { category: "no_postgres_url", message: "Both base and target need a Direct Postgres URL." },
      { status: 400 },
    );
  }

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many sync attempts, try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const userId = session.user.id;
  const targetConn = access.conn;
  const encoder = new TextEncoder();

  // `clientGone` flips when the browser disconnects (tab close, navigation).
  // A real (non-dry) run must NOT die with the stream — it holds an open
  // target transaction — so once the client is gone we stop enqueuing (which
  // would throw and abort the run) and let the run finish and persist to the
  // sync_run row, which the client can re-read on reconnect.
  let clientGone = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed by a disconnect — swallow so the run
          // continues to completion instead of unwinding the transaction.
          clientGone = true;
        }
      };

      const run = await createRun({
        userId,
        profileId,
        baseConnectionId: profile.baseConnectionId,
        targetConnectionId: id,
        dryRun,
      });
      send("run", { id: run.id, dryRun });

      // Accumulate progress and mirror it onto the sync_run row as the run
      // proceeds. Persistence is best-effort and fire-and-forget (the final
      // updateRun is authoritative) — its purpose is so a reconnecting client
      // or the run-history view can read real progress, and so a run killed
      // mid-flight leaves a partial trail instead of a frozen "introspect".
      const liveStats: SyncRunStats = { tables: [], warnings: [] };
      const persist = (patch: Parameters<typeof updateRun>[2]) => {
        void updateRun(userId, run.id, patch).catch(() => undefined);
      };

      try {
        const result = await executeSyncRun({
          base,
          target: targetConn,
          tableConfig: profile.tableConfig,
          options: profile.options,
          dryRun,
          shouldAbort: async () => (await getRun(userId, run.id))?.status === "aborted",
          hooks: {
            onPhase: (phase, detail) => {
              send("phase", { phase, detail });
              if (!dryRun) persist({ phase });
            },
            onTableStart: (table, estimatedRows) => send("table_start", { table, estimatedRows }),
            onTableDone: (table, rowsCopied, durationMs) => {
              send("table_done", { table, rowsCopied, durationMs });
              if (!dryRun) {
                liveStats.tables.push({ table, rowsCopied, durationMs });
                persist({ phase: "data_copy", stats: liveStats });
              }
            },
            onTableVerified: (table, verifiedRows) => {
              send("table_verified", { table, verifiedRows });
              if (!dryRun) {
                const stat = liveStats.tables.find((t) => t.table === table);
                if (stat) stat.verifiedRows = verifiedRows;
                persist({ phase: "verify", stats: liveStats });
              }
            },
            onWarning: (message) => {
              send("warning", { message });
              if (!dryRun) {
                liveStats.warnings.push(message);
                persist({ stats: liveStats });
              }
            },
          },
        });

        await updateRun(userId, run.id, {
          status: result.status,
          phase: "done",
          stats: result.stats,
          error: result.error ?? null,
          finishedAt: new Date(),
        });
        send("result", {
          status: result.status,
          stats: result.stats,
          plan: result.plan,
          error: result.error,
        });
      } catch (e) {
        // Driver errors can embed the connection URL — redact before the
        // message is stored on the run row or streamed to the browser.
        const message = redact((e as Error).message ?? "Sync failed.");
        const stats: SyncRunStats = { tables: [], warnings: [] };
        await updateRun(userId, run.id, {
          status: "failed",
          stats,
          error: message,
          finishedAt: new Date(),
        });
        send("error", { message });
      } finally {
        send("done", {});
        if (!clientGone) {
          try {
            controller.close();
          } catch {
            // Already closed by a disconnect — nothing to do.
          }
        }
      }
    },
    cancel() {
      // Browser disconnected. Don't touch the run — the start() body keeps
      // executing to completion and persists the final status itself.
      clientGone = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
