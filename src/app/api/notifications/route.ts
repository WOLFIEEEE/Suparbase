import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { countUnread, listNotifications } from "@/server/notifications/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/notifications?unread=1&limit=30 — the caller's inbox + unread count. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Number(req.nextUrl.searchParams.get("limit")) || undefined;
  const [items, unread] = await Promise.all([
    listNotifications(session.user.id, { unreadOnly, limit }),
    countUnread(session.user.id),
  ]);
  return NextResponse.json({ notifications: items, unread }, { headers: { "Cache-Control": "no-store" } });
}
