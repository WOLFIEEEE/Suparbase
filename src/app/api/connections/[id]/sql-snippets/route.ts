import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { sqlSnippets } from "@/server/schema";
import { getConnectionAccess } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_SNIPPETS_PER_CONNECTION = 100;

/** GET /api/connections/[id]/sql-snippets — this user's snippets, newest first. */
export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const rows = await db
    .select({
      id: sqlSnippets.id,
      name: sqlSnippets.name,
      sql: sqlSnippets.sql,
      updatedAt: sqlSnippets.updatedAt,
    })
    .from(sqlSnippets)
    .where(and(eq(sqlSnippets.userId, session.user.id), eq(sqlSnippets.connectionId, id)))
    .orderBy(desc(sqlSnippets.updatedAt))
    .limit(MAX_SNIPPETS_PER_CONNECTION);
  return NextResponse.json({ snippets: rows });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sql: z.string().min(1).max(20_000),
});

/**
 * POST /api/connections/[id]/sql-snippets — save (upsert by name). Saving
 * under an existing name overwrites that snippet, which is what "Save"
 * means to a user re-saving an edited query.
 */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const count = await db
    .select({ id: sqlSnippets.id })
    .from(sqlSnippets)
    .where(and(eq(sqlSnippets.userId, session.user.id), eq(sqlSnippets.connectionId, id)))
    .limit(MAX_SNIPPETS_PER_CONNECTION);
  const exists = await db
    .select({ id: sqlSnippets.id })
    .from(sqlSnippets)
    .where(
      and(
        eq(sqlSnippets.userId, session.user.id),
        eq(sqlSnippets.connectionId, id),
        eq(sqlSnippets.name, parsed.data.name),
      ),
    )
    .limit(1);
  if (count.length >= MAX_SNIPPETS_PER_CONNECTION && exists.length === 0) {
    return NextResponse.json(
      {
        category: "validation",
        message: `Snippet limit reached (${MAX_SNIPPETS_PER_CONNECTION} per connection). Delete one first.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const [row] = await db
    .insert(sqlSnippets)
    .values({
      userId: session.user.id,
      connectionId: id,
      name: parsed.data.name,
      sql: parsed.data.sql,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sqlSnippets.userId, sqlSnippets.connectionId, sqlSnippets.name],
      set: { sql: parsed.data.sql, updatedAt: now },
    })
    .returning({
      id: sqlSnippets.id,
      name: sqlSnippets.name,
      sql: sqlSnippets.sql,
      updatedAt: sqlSnippets.updatedAt,
    });
  return NextResponse.json({ snippet: row }, { status: 201 });
}
