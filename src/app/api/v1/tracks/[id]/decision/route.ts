import { appUser } from "@/lib/app-auth";
import { body, fail, json, unauthorized } from "@/lib/api-v1";
import { isDecision } from "@/lib/db";
import { ownedTrack } from "@/lib/desk";
import { allow } from "@/lib/ratelimit";
import { decide } from "@/lib/review";

export const runtime = "nodejs";

/** Keep or "not for me": { decision: "kept" | "passed" }. Private to the receiver, as on the web. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/tracks/[id]/decision">) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  if (!(await allow("app_decision", String(u.id), 600, 3_600_000))) return fail("Too many changes. Try again shortly.", 429);
  const decision = (await body(req)).decision;
  if (!isDecision(decision)) return fail("Choose kept or passed.", 400);
  const t = await ownedTrack(u, Number((await ctx.params).id));
  if (!t) return fail("Not found", 404);
  await decide(u, t, decision);
  return json({ ok: true });
}
