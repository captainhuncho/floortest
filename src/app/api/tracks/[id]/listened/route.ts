import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { audit, trackLabel } from "@/lib/audit";
import { markListened } from "@/lib/review";
import { ownedTrack } from "@/lib/desk";

export const runtime = "nodejs";

/** Body: { seconds } actually heard in this session, seeks excluded. */
export async function POST(req: Request, ctx: RouteContext<"/api/tracks/[id]/listened">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = await ownedTrack(user.id, Number((await ctx.params).id));
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { seconds } = (await req.json().catch(() => ({}))) as { seconds?: number };
  const first = await markListened(user, t, Number(seconds) || 0);
  // Once per track: the first qualifying listen, not every replay.
  if (first) await audit(user.id, "listened", trackLabel(t), t.id);
  return NextResponse.json({ first });
}
