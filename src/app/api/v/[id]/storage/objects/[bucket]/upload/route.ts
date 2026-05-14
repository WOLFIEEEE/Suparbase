import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { uploadObject, StorageApiError } from "@/server/proxy/storage";
import { checkWriteRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface Params {
  params: Promise<{ id: string; bucket: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, bucket } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const limit = checkWriteRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many uploads — try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ category: "validation", message: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const path = String(form.get("path") ?? "").trim();
  const upsert = String(form.get("upsert") ?? "false") === "true";

  if (!path) {
    return NextResponse.json({ category: "validation", message: "Missing 'path' field." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ category: "validation", message: "Missing 'file'." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { category: "validation", message: `File exceeds ${MAX_SIZE_BYTES / 1024 / 1024}MB upload cap.` },
      { status: 413 },
    );
  }

  try {
    await uploadObject(conn, bucket, path, file, file.type || "application/octet-stream", { upsert });
    return NextResponse.json({ ok: true, path });
  } catch (e) {
    if (e instanceof StorageApiError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Upload failed." },
      { status: 500 },
    );
  }
}
