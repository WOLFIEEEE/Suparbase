import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import {
  AuthAdminError,
  createUser,
  listUsers,
  sendInvite,
} from "@/server/proxy/auth-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get("per_page") ?? 50) || 50));
  try {
    const result = await listUsers(conn, page, perPage);
    return NextResponse.json(result);
  } catch (e) {
    return errResp(e);
  }
}

const CreateSchema = z.object({
  mode: z.enum(["create", "invite"]).default("invite"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  emailConfirm: z.boolean().optional(),
  phoneConfirm: z.boolean().optional(),
  userMetadata: z.record(z.unknown()).optional(),
  appMetadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "owner");
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
    if (body.mode === "invite") {
      if (!body.email)
        return NextResponse.json(
          { category: "validation", message: "Invite requires an email." },
          { status: 400 },
        );
      const user = await sendInvite(conn, body.email, body.userMetadata);
      return NextResponse.json(user);
    }
    const user = await createUser(conn, {
      email: body.email,
      phone: body.phone,
      password: body.password,
      emailConfirm: body.emailConfirm,
      phoneConfirm: body.phoneConfirm,
      userMetadata: body.userMetadata,
      appMetadata: body.appMetadata,
    });
    return NextResponse.json(user);
  } catch (e) {
    return errResp(e);
  }
}

function errResp(e: unknown): NextResponse {
  if (e instanceof AuthAdminError) {
    return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { category: "server", message: (e as Error).message ?? "Auth admin call failed." },
    { status: 500 },
  );
}
