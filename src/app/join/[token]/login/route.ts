import { NextResponse } from "next/server";
import { NEXT_COOKIE, TEAM_INVITE_COOKIE } from "@/lib/next-path";
import { fromThisSite } from "@/lib/same-site";

/**
 * "Log in to accept": remember the invite page, then sign in. Only when the button on our invite page was pressed:
 * a link on another site still goes to sign-in, but can't plant its own invite for afterwards.
 */
export async function GET(req: Request, ctx: RouteContext<"/join/[token]/login">) {
  const { token } = await ctx.params;
  const res = NextResponse.redirect(new URL("/login", req.url));
  if (/^[A-Za-z0-9_-]{20,64}$/.test(token) && fromThisSite(req.headers)) {
    const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 };
    res.cookies.set(NEXT_COOKIE, `/join/${token}`, opts);
    // If "Continue with Google" turns out to have no account yet, Google sign-up still knows the invite.
    res.cookies.set(TEAM_INVITE_COOKIE, token, opts);
  }
  return res;
}
