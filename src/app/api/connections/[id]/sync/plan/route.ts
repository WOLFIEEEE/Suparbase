import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole, requireRole } from "@/server/connections/repo";
import { getProfile } from "@/server/sync/repo";
import { planRequestSchema } from "@/server/sync/validate";
import { executeSyncRun } from "@/server/sync/runner";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { SyncSafetyError } from "@/server/sync/safety";
import { DEFAULT_SYNC_OPTIONS, DEFAULT_SYNC_TABLE_CONFIG } from "@/server/schema/sync";
import type { SyncOptions, SyncTableConfig } from "@/server/schema/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/** Dry-run preview: introspect both DBs, build the plan, write nothing. */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const access = await requireRole(session.user.id, id, "owner");
  if (!access) return NextResponse.json({ category: "forbidden" }, { status: 403 });

  const parsed = planRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  let baseConnectionId: string;
  let options: SyncOptions = DEFAULT_SYNC_OPTIONS;
  let tableConfig: SyncTableConfig = DEFAULT_SYNC_TABLE_CONFIG;

  if ("profileId" in parsed.data) {
    const profile = await getProfile(session.user.id, parsed.data.profileId);
    if (!profile || profile.targetConnectionId !== id) {
      return NextResponse.json({ category: "not_found" }, { status: 404 });
    }
    baseConnectionId = profile.baseConnectionId;
    options = profile.options;
    tableConfig = profile.tableConfig;
  } else {
    baseConnectionId = parsed.data.baseConnectionId;
    options = parsed.data.options;
    tableConfig = parsed.data.tableConfig;
  }

  if (baseConnectionId === id) {
    return NextResponse.json(
      { category: "validation", message: "Base and target must differ." },
      { status: 400 },
    );
  }
  const base = await getConnectionForRole(session.user.id, baseConnectionId, "viewer");
  if (!base) {
    return NextResponse.json(
      { category: "validation", message: "Base connection not found or not accessible." },
      { status: 400 },
    );
  }

  try {
    const result = await executeSyncRun({
      base,
      target: access.conn,
      tableConfig,
      options,
      dryRun: true,
    });
    return NextResponse.json({ plan: result.plan, warnings: result.stats.warnings });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        { category: "no_postgres_url", message: e.message },
        { status: 400 },
      );
    }
    if (e instanceof SyncSafetyError) {
      return NextResponse.json({ category: "validation", message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Plan failed." },
      { status: 500 },
    );
  }
}
