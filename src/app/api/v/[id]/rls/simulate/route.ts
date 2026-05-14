import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import {
  withRlsSimulation,
  NoPostgresUrlError,
  PgQueryError,
} from "@/server/proxy/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  table: z.string().min(1).max(120),
  role: z.enum(["anon", "authenticated", "service_role"]),
  claims: z.record(z.unknown()).optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

interface VerbResult {
  verb: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  allowed: boolean;
  rowsVisible?: number;
  message?: string;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  let body: { table: string; role: "anon" | "authenticated" | "service_role"; claims?: Record<string, unknown> };
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }

  // Quote-safe: table name validated against schema introspection? For
  // v1 we treat it as an identifier and quote it. We also gate the actual
  // SQL execution inside withRlsSimulation which always rolls back.
  const ident = `"${body.table.replace(/"/g, '""')}"`;

  try {
    const results = await withRlsSimulation(
      conn,
      { role: body.role, claims: body.claims },
      async (tx) => {
        const out: VerbResult[] = [];

        // SELECT: count visible rows.
        try {
          const r = await tx.unsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM public.${ident}`,
          );
          out.push({ verb: "SELECT", allowed: true, rowsVisible: r[0]?.n ?? 0 });
        } catch (e) {
          out.push({
            verb: "SELECT",
            allowed: false,
            message: (e as Error).message.split("\n")[0] ?? "denied",
          });
        }

        // INSERT: try a no-op default-only insert. Rolled back regardless.
        try {
          await tx.unsafe(`INSERT INTO public.${ident} DEFAULT VALUES`);
          out.push({ verb: "INSERT", allowed: true });
        } catch (e) {
          const msg = (e as Error).message.split("\n")[0] ?? "denied";
          // A NOT-NULL / unique violation still means RLS *would* allow it.
          const rlsBlock = /policy|row-level/i.test(msg);
          out.push({
            verb: "INSERT",
            allowed: !rlsBlock,
            message: rlsBlock ? msg : "would pass RLS; row constraints may still reject.",
          });
        }

        // UPDATE: touch every row with `SET <pk>=<pk>` to test visibility.
        try {
          const pkRows = await tx.unsafe<{ a: string }[]>(
            `SELECT a.attname AS a FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = any(i.indkey)
             WHERE i.indrelid = 'public.${ident}'::regclass AND i.indisprimary
             LIMIT 1`,
          );
          if (pkRows.length === 0) {
            out.push({
              verb: "UPDATE",
              allowed: false,
              message: "no primary key: skipped.",
            });
          } else {
            const pk = `"${pkRows[0]!.a.replace(/"/g, '""')}"`;
            const r = await tx.unsafe<{ n: number }[]>(
              `WITH u AS (UPDATE public.${ident} SET ${pk} = ${pk} RETURNING 1)
               SELECT count(*)::int AS n FROM u`,
            );
            out.push({ verb: "UPDATE", allowed: true, rowsVisible: r[0]?.n ?? 0 });
          }
        } catch (e) {
          out.push({
            verb: "UPDATE",
            allowed: false,
            message: (e as Error).message.split("\n")[0] ?? "denied",
          });
        }

        // DELETE: try DELETE WHERE FALSE so it touches no rows but still
        // exercises the policy at planning time.
        try {
          await tx.unsafe(`DELETE FROM public.${ident} WHERE FALSE`);
          out.push({ verb: "DELETE", allowed: true });
        } catch (e) {
          out.push({
            verb: "DELETE",
            allowed: false,
            message: (e as Error).message.split("\n")[0] ?? "denied",
          });
        }

        return out;
      },
    );

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        { category: "no_postgres_url", message: e.message },
        { status: 400 },
      );
    }
    if (e instanceof PgQueryError) {
      return NextResponse.json({ category: "server", message: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Simulation failed." },
      { status: 500 },
    );
  }
}
