import { NextResponse } from "next/server";
import { NEXT_COOKIE } from "@/lib/next-path";

/** "Log in to accept": remember the invite page, then sign in. */
export async function GET(req: Request, ctx: RouteContext<"/join/[token]/login">) {
  const { token } = await ctx.params;
  const res = NextResponse.redirect(new URL("/login", req.url));
  if (/^[A-Za-z0-9_-]{20,64}$/.test(token)) res.cookies.set(NEXT_COOKIE, `/join/${token}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return res;
}
