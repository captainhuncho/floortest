import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { checkFlow, GOOGLE_COOKIE, GOOGLE_SIGNUP_COOKIE, googleConfig, identityFromCode, signIdentity, SIGNUP_MS } from "@/lib/google-auth";
import { finishSignIn } from "@/lib/security";
import { signChallenge } from "@/lib/totp";

export const runtime = "nodejs";

const CHALLENGE = "floortest_2fa";
const NEXT = "floortest_next";

/** Google sends the browser back here. Signs in the account with the same confirmed email, or explains why not. */
export async function GET(req: Request) {
  const jar = await cookies();
  const flowCookie = jar.get(GOOGLE_COOKIE)?.value;
  // Single use: the flow cookie goes whatever happens next.
  jar.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
  const back = (reason: string) => NextResponse.redirect(`${env.appUrl}/login?google=${reason}`);
  const cfg = googleConfig();
  const url = new URL(req.url);
  if (!cfg) return back("off");
  if (url.searchParams.get("error")) return back("cancelled");
  const verifier = checkFlow(flowCookie, url.searchParams.get("state"), env.secret);
  const code = url.searchParams.get("code");
  if (!verifier || !code) return back("expired");
  const who = await identityFromCode(cfg, code, verifier, `${env.appUrl}/api/auth/google/callback`);
  if (!who) return back("failed");

  // Signs in only an account whose email was already confirmed with us; Google never claims an unconfirmed one.
  const user = await q.get<{ id: number; suspended_at: number | null; totp_enabled_at: number | null; email_verified_at: number | null }>(
    "SELECT id, suspended_at, totp_enabled_at, email_verified_at FROM users WHERE lower(email) = ?",
    who.email,
  );
  if (user && !user.email_verified_at) return back("unconfirmed");
  // No account yet: on to the sign-up form, which still asks for an invite code during the beta.
  if (!user) {
    jar.set(GOOGLE_SIGNUP_COOKIE, signIdentity(who, env.secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SIGNUP_MS / 1000 });
    return NextResponse.redirect(`${env.appUrl}/signup/google`);
  }
  if (user.suspended_at) return back("suspended");
  if (user.totp_enabled_at) {
    jar.set(CHALLENGE, signChallenge(user.id, env.secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
    return NextResponse.redirect(`${env.appUrl}/login/verify`);
  }
  await finishSignIn(user.id, "Google");
  const next = jar.get(NEXT)?.value ?? "";
  if (/^\/s\/[A-Za-z0-9_-]{10,40}$/.test(next)) {
    jar.delete(NEXT);
    return NextResponse.redirect(`${env.appUrl}${next}`);
  }
  return NextResponse.redirect(`${env.appUrl}/dashboard/floor`);
}
