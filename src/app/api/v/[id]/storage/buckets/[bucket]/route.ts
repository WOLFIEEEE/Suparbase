import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { deleteBucket, StorageApiError } from "@/server/proxy/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; bucket: string }>;
}

export async function DELETE(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, bucket } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const url = new URL(req.url);
  const empty = url.searchParams.get("empty") === "1";
  try {
    await deleteBucket(conn, bucket, { empty });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof StorageApiError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Failed." },
      { status: 500 },
    );
  }
}
