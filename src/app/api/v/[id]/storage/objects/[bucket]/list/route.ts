import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { listObjects, StorageApiError } from "@/server/proxy/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  prefix: z.string().max(500).default(""),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

interface Params {
  params: Promise<{ id: string; bucket: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, bucket } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
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
    const result = await listObjects(conn, bucket, body.prefix, body.limit, body.offset);
    return NextResponse.json(result);
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
