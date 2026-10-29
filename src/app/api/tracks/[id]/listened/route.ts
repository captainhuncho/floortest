import { NextResponse } from "next/server";
import { currentDeskForChange, currentSessionHash } from "@/lib/auth";
import { audit, trackLabel } from "@/lib/audit";
import { recordListen } from "@/lib/review";
import { ownedTrack } from "@/lib/desk";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Body: { event: "play" | "beat" }. The player sends "play" when a track starts or resumes and "beat" about every 10 s
 * while it plays; the server counts the time itself (src/lib/review.ts, recordListen). No number from the browser is
 * trusted. Each request re-checks the sign-in and the person's place on the desk, so leaving the team ends the listen.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/tracks/[id]/listened">) {
  const user = await currentDeskForChange();
  if (user instanceof Response) return user;
  const session = await currentSessionHash();
  if (!user || !session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = await ownedTrack(user, Number((await ctx.params).id));
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { event } = (await req.json().catch(() => ({}))) as { event?: string };
  if (event !== "play" && event !== "beat") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // Ten check-ins a minute is more than any honest player sends (one every ~10 s, plus a play on each resume).
  if (!(await allow("listen", `${user.actor_id}:${t.id}`, 20, 60_000))) return NextResponse.json({ first: false }, { status: 429 });
  const first = await recordListen(user, t, event, session);
  // Once per track: the first qualifying listen, not every replay.
  if (first) await audit(user.id, "listened", trackLabel(t), t.id);
  return NextResponse.json({ first });
}
