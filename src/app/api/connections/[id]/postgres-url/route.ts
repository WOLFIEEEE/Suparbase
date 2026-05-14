import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser, setPostgresUrl } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^postgres(?:ql)?:\/\/.+/.test(v),
      "Must start with postgres:// or postgresql:// (or be empty to clear).",
    ),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }

  let body: { url: string | null };
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }

  const cleaned = body.url && body.url.length > 0 ? body.url : null;
  const summary = await setPostgresUrl(session.user.id, id, cleaned);
  if (!summary) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json(summary);
}
