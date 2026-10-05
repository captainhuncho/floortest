import { NextResponse } from "next/server";
import { referralCodeFor } from "@/lib/core";
import { shareByToken } from "@/lib/share";

export const runtime = "nodejs";

/**
 * From a share link to sign-in or sign-up, remembering the track for an hour so they land back on it.
 * Signing up uses the sharer's referral code, so a colleague can join even while sign-up is invite-only.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/share/[token]/join">) {
  const { token } = await ctx.params;
  const s = await shareByToken(token);
  const url = new URL(req.url);
  if (!s) return NextResponse.redirect(new URL("/", url));
  const to = url.searchParams.get("to") === "signup" ? `/signup?ref=${encodeURIComponent(await referralCodeFor(s.receiver_id))}` : "/login";
  const res = NextResponse.redirect(new URL(to, url));
  res.cookies.set("floortest_next", `/share/${token}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return res;
}
