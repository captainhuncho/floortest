import { NextResponse } from "next/server";
import { liveInviteCode } from "@/lib/invites";
import { allow, ipFrom } from "@/lib/ratelimit";
import { GATE_COOKIE, GATE_DAYS, gatePassword, gateToken } from "@/lib/site-gate";

/** Wrong codes allowed per address in ten minutes, so the gate can't be opened by guessing. */
const TRIES = 20;
const WINDOW_MS = 10 * 60_000;

/**
 * A beta invite link. While the site is behind the coming-soon password, a live personal invite counts as the pass
 * (like a team invite or signing in), so the invited person reaches sign-up; anything else gets the coming-soon page.
 * The proxy sends old-style links (/signup?invite=CODE) here too. Other query values (handle) ride along.
 */
export async function GET(req: Request, ctx: RouteContext<"/invite/[code]">) {
  const { code } = await ctx.params;
  const signup = new URL("/signup", req.url);
  new URL(req.url).searchParams.forEach((v, k) => k !== "invite" && signup.searchParams.set(k, v));
  signup.searchParams.set("invite", code);
  if (!gatePassword()) return NextResponse.redirect(signup);
  const open = (await allow("invite-gate", ipFrom(req.headers), TRIES, WINDOW_MS)) && (await liveInviteCode(code));
  if (!open) return NextResponse.redirect(new URL("/coming-soon", req.url));
  const res = NextResponse.redirect(signup);
  res.cookies.set(GATE_COOKIE, gateToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GATE_DAYS * 86_400 });
  return res;
}
