import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { deleteObjects, StorageApiError } from "@/server/proxy/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(100),
});

interface Params {
  params: Promise<{ id: string; bucket: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, bucket } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }
  try {
    await deleteObjects(conn, bucket, body.paths);
    return NextResponse.json({ ok: true, deleted: body.paths.length });
  } catch (e) {
    if (e instanceof StorageApiError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Delete failed." },
      { status: 500 },
    );
  }
}
