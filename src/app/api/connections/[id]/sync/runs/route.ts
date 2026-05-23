import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess, getConnectionForUser, requireRole } from "@/server/connections/repo";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { createRun, getProfile, listRuns, updateRun } from "@/server/sync/repo";
import { startRunSchema } from "@/server/sync/validate";
import { executeSyncRun } from "@/server/sync/runner";
import { verifyConfirmation } from "@/server/sync/safety";
import type { SyncRunStats } from "@/server/schema/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

  const access = await requireRole(session.user.id, id, "editor");
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

  const base = await getConnectionForUser(session.user.id, profile.baseConnectionId);
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const run = await createRun({
        userId,
        profileId,
        baseConnectionId: profile.baseConnectionId,
        targetConnectionId: id,
        dryRun,
      });
      send("run", { id: run.id, dryRun });

      try {
        const result = await executeSyncRun({
          base,
          target: targetConn,
          tableConfig: profile.tableConfig,
          options: profile.options,
          dryRun,
          hooks: {
            onPhase: (phase, detail) => send("phase", { phase, detail }),
            onTableStart: (table, estimatedRows) => send("table_start", { table, estimatedRows }),
            onTableDone: (table, rowsCopied, durationMs) =>
              send("table_done", { table, rowsCopied, durationMs }),
            onWarning: (message) => send("warning", { message }),
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
        const message = (e as Error).message ?? "Sync failed.";
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
        controller.close();
      }
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
