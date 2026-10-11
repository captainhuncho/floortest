import { cookies } from "next/headers";
import { NEXT_COOKIE, safeNext } from "@/lib/next-path";
import { NextResponse } from "next/server";
import { currentPerson } from "@/lib/auth";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { checkFlow, GOOGLE_COOKIE, GOOGLE_LINK_COOKIE, GOOGLE_SIGNUP_COOKIE, googleConfig, identityFromCode, LINK_MS, signIdentity, signPendingLink, SIGNUP_MS } from "@/lib/google-auth";
import { pinGoogle } from "@/lib/google-link";
import { finishSignIn } from "@/lib/security";
import { signChallenge } from "@/lib/totp";

export const runtime = "nodejs";

const CHALLENGE = "floortest_2fa";
const NEXT = NEXT_COOKIE;
type Account = { id: number; email: string; suspended_at: number | null; totp_enabled_at: number | null; email_verified_at: number | null; google_sub: string | null };
const COLS = "id, email, suspended_at, totp_enabled_at, email_verified_at, google_sub";

/** Google sends the browser back here. See lib/google-auth.ts for the rules. */
export async function GET(req: Request) {
  const jar = await cookies();
  const flowCookie = jar.get(GOOGLE_COOKIE)?.value;
  // Single use: the flow cookie goes whatever happens next.
  jar.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
  const go = (path: string) => NextResponse.redirect(`${env.appUrl}${path}`);
  const back = (reason: string) => go(`/login?google=${reason}`);
  const secure = process.env.NODE_ENV === "production";
  const cfg = googleConfig();
  const url = new URL(req.url);
  if (!cfg) return back("off");
  const flow = checkFlow(flowCookie, url.searchParams.get("state"), env.secret);
  const settings = (r: string) => go(`/dashboard/settings/security?google=${r}`);
  if (url.searchParams.get("error")) return flow?.link ? settings("cancelled") : back("cancelled");
  const code = url.searchParams.get("code");
  if (!flow || !code) return back("expired");
  const who = await identityFromCode(cfg, code, flow.verifier, `${env.appUrl}/api/auth/google/callback`);

  // Connecting from Settings: the signed-in account, and only a Google account with the same email.
  if (flow.link) {
    const me = await currentPerson();
    if (!me || me.id !== flow.link) return back("expired");
    if (who === "untrusted") return settings("untrusted");
    if (who === "bad") return settings("failed");
    if (who.email !== me.email.toLowerCase()) return settings("mismatch");
    return settings((await pinGoogle(me.id, who.sub)) ? "connected" : "taken");
  }

  if (who === "untrusted") return back("untrusted");
  if (who === "bad") return back("failed");
  // The pinned Google account signs in its own FloorTest account, even if either email has changed since.
  const pinned = await q.get<Account>(`SELECT ${COLS} FROM users WHERE google_sub = ?`, who.sub);
  const user = pinned ?? (await q.get<Account>(`SELECT ${COLS} FROM users WHERE lower(email) = ?`, who.email));

  // No account yet: on to the sign-up form, which still asks for an invite code during the beta.
  if (!user) {
    jar.set(GOOGLE_SIGNUP_COOKIE, signIdentity(who, env.secret), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SIGNUP_MS / 1000 });
    return go("/signup/google");
  }
  if (user.suspended_at) return back("suspended");
  if (!pinned) {
    // Same email, but a different Google account is already pinned: refuse.
    if (user.google_sub) return back("different");
    // Never claim an unconfirmed account.
    if (!user.email_verified_at) return back("unconfirmed");
    // First time: the owner approves with their password before this Google account is pinned.
    jar.set(GOOGLE_LINK_COOKIE, signPendingLink({ userId: user.id, sub: who.sub, email: user.email }, env.secret), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: LINK_MS / 1000 });
    return go("/login/google");
  }
  if (user.totp_enabled_at) {
    jar.set(CHALLENGE, signChallenge(user.id, env.secret), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 300 });
    return go("/login/verify");
  }
  await finishSignIn(user.id, "Google");
  const next = jar.get(NEXT)?.value ?? "";
  if (safeNext(next)) {
    jar.delete(NEXT);
    return go(next);
  }
  return go("/dashboard/floor");
}
