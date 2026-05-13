import { type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { jsonError, proxyForward } from "@/server/proxy/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; path: string[] }>;
}

async function handle(req: NextRequest, ctx: Params, method: string): Promise<Response> {
  const session = await auth();
  if (!session?.user) return jsonError(401, "unauthorized", "Not signed in.");
  const { id, path } = await ctx.params;
  return proxyForward({
    request: req,
    method,
    connectionId: id,
    userId: session.user.id,
    pathParts: path,
  });
}

export const GET = (req: NextRequest, ctx: Params) => handle(req, ctx, "GET");
export const HEAD = (req: NextRequest, ctx: Params) => handle(req, ctx, "HEAD");
export const POST = (req: NextRequest, ctx: Params) => handle(req, ctx, "POST");
export const PATCH = (req: NextRequest, ctx: Params) => handle(req, ctx, "PATCH");
export const PUT = (req: NextRequest, ctx: Params) => handle(req, ctx, "PUT");
export const DELETE = (req: NextRequest, ctx: Params) => handle(req, ctx, "DELETE");
