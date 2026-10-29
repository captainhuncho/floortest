import { NextResponse } from "next/server";
import { NEXT_COOKIE } from "@/lib/next-path";
import { fromThisSite } from "@/lib/same-site";

/**
 * "Log in to open": for a collection shared with an account (`/c/a.<id>`), remember where to come back to, then sign in.
 * Only when opened from our own page, so another site can't choose where someone lands after signing in.
 */
export async function GET(req: Request, ctx: RouteContext<"/c/[token]/login">) {
  const { token } = await ctx.params;
  const back = `/c/${token}`;
  const res = NextResponse.redirect(new URL("/login", req.url));
  if (/^a\.\d{1,12}$/.test(token) && fromThisSite(req.headers)) res.cookies.set(NEXT_COOKIE, back, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return res;
}
