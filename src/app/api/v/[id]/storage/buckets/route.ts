import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { createBucket, listBuckets, StorageApiError } from "@/server/proxy/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const buckets = await listBuckets(conn);
    return NextResponse.json({ buckets });
  } catch (e) {
    return errorResponse(e);
  }
}

const CreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9.\-_]{0,62}[a-z0-9]$|^[a-z0-9]$/, {
      message: "Names must be lowercase letters, numbers, dots, dashes, or underscores.",
    }),
  isPublic: z.boolean().default(false),
  fileSizeLimit: z.number().int().positive().nullable().optional(),
  allowedMimeTypes: z.array(z.string()).max(20).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }
  try {
    const bucket = await createBucket(conn, {
      name: body.name,
      isPublic: body.isPublic,
      fileSizeLimit: body.fileSizeLimit ?? null,
      allowedMimeTypes: body.allowedMimeTypes ?? null,
    });
    return NextResponse.json(bucket);
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  if (e instanceof StorageApiError) {
    return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { category: "server", message: (e as Error).message ?? "Unknown error." },
    { status: 500 },
  );
}
