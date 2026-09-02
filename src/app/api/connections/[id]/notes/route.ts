import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess, roleAtLeast } from "@/server/connections/repo";
import { countNotesInScope, createNote, listNotes } from "@/server/notes/repo";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_NOTES_PER_SCOPE = 100;

function parsePk(raw: string | null): Record<string, unknown> | null | undefined {
  if (raw === null || raw === "") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return undefined;
}

/** GET ?table=<name>&pk=<json|empty> — notes for a table (pk empty) or a row. */
export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const table = req.nextUrl.searchParams.get("table")?.trim();
  const pk = parsePk(req.nextUrl.searchParams.get("pk"));
  if (!table || pk === undefined) {
    return NextResponse.json({ category: "validation", message: "table is required; pk must be a JSON object." }, { status: 400 });
  }
  const notes = await listNotes(id, table, pk);
  return NextResponse.json({ notes, myRole: access.role, myUserId: session.user.id });
}

const CreateSchema = z.object({
  table: z.string().trim().min(1).max(200),
  primaryKey: z.record(z.unknown()).nullable(),
  body: z.string().trim().min(1).max(4000),
});

/** POST — add a note (editor+). */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (!roleAtLeast(access.role, "editor")) {
    return NextResponse.json({ category: "forbidden", message: "Editor access is required." }, { status: 403 });
  }
  const limited = limitOr429(session.user.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const existing = await countNotesInScope(id, parsed.data.table, parsed.data.primaryKey);
  if (existing >= MAX_NOTES_PER_SCOPE) {
    return NextResponse.json(
      { category: "validation", message: `Note limit reached (${MAX_NOTES_PER_SCOPE}). Delete one first.` },
      { status: 400 },
    );
  }
  const noteId = await createNote({
    connectionId: id,
    authorId: session.user.id,
    tableName: parsed.data.table,
    primaryKey: parsed.data.primaryKey,
    body: parsed.data.body,
  });
  return NextResponse.json({ id: noteId }, { status: 201 });
}
