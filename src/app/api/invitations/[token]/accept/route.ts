import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { acceptInvitation } from "@/server/team/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { category: "unauthorized", message: "Sign in to accept this invitation." },
      { status: 401 },
    );
  }
  const { token } = await ctx.params;
  try {
    const result = await acceptInvitation(token, session.user.id, session.user.email ?? null);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AppError) {
      const status =
        e.category === "not_found"
          ? 404
          : e.category === "unauthorized"
          ? 403
          : 400;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Accept failed." },
      { status: 500 },
    );
  }
}
