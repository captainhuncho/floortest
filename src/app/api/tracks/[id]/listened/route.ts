import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { markListened, ownedTrack } from "@/lib/core";

export const runtime = "nodejs";

/** Body: { seconds } actually heard in this session, seeks excluded. */
export async function POST(req: Request, ctx: RouteContext<"/api/tracks/[id]/listened">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = await ownedTrack(user.id, Number((await ctx.params).id));
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { seconds } = (await req.json().catch(() => ({}))) as { seconds?: number };
  return NextResponse.json({ first: await markListened(user, t, Number(seconds) || 0) });
}
