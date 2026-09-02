import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import {
  executeProposal,
  ProposalExecutionError,
  type ExecuteProposal,
} from "@/server/proxy/execute-proposal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FilterSchema = z.object({
  column: z.string(),
  op: z.string(),
  value: z.unknown(),
});

const ProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposed_update"),
    table: z.string().min(1),
    filters: z.array(FilterSchema).min(1).max(20),
    patch: z.record(z.unknown()),
  }),
  z.object({
    kind: z.literal("proposed_insert"),
    table: z.string().min(1),
    values: z.record(z.unknown()),
  }),
  z.object({
    kind: z.literal("proposed_delete"),
    table: z.string().min(1),
    filters: z.array(FilterSchema).min(1).max(20),
  }),
]);

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  let proposal: ExecuteProposal;
  try {
    proposal = ProposalSchema.parse(await req.json()) as ExecuteProposal;
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Invalid proposal payload." },
      { status: 400 },
    );
  }

  try {
    const result = await executeProposal({
      userId: session.user.id,
      conn,
      proposal,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ProposalExecutionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Execute failed." },
      { status: 500 },
    );
  }
}
