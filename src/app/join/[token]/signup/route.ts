import { NextResponse } from "next/server";
import { inviteBySecret } from "@/lib/account-members";
import { GATE_COOKIE, GATE_DAYS, gatePassword, gateToken } from "@/lib/site-gate";

/**
 * "Create your login" from a team invite. While the site is behind the coming-soon password, a live invite counts as
 * the pass (like signing in does), so the invited person can reach sign-up. Then sign-up with the invite.
 */
export async function GET(req: Request, ctx: RouteContext<"/join/[token]/signup">) {
  const { token } = await ctx.params;
  const inv = await inviteBySecret(token);
  if (!inv) return NextResponse.redirect(new URL(`/join/${encodeURIComponent(token)}`, req.url));
  const res = NextResponse.redirect(new URL(`/signup?team=${encodeURIComponent(token)}`, req.url));
  if (gatePassword()) res.cookies.set(GATE_COOKIE, gateToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GATE_DAYS * 86_400 });
  return res;
}
