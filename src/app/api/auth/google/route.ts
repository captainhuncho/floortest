import { NextResponse } from "next/server";
import { env, isPreview } from "@/lib/env";
import { FLOW_MS, GOOGLE_COOKIE, googleConfig, startFlow } from "@/lib/google-auth";

export const runtime = "nodejs";

/** Starts "Continue with Google": remembers a fresh state + PKCE verifier and sends the browser to Google. */
export async function GET() {
  const cfg = googleConfig();
  // Preview deployments have changing addresses Google doesn't know, so it's off there.
  if (!cfg || isPreview) return NextResponse.redirect(`${env.appUrl}/login`);
  const flow = startFlow(cfg.id, `${env.appUrl}/api/auth/google/callback`, env.secret);
  const res = NextResponse.redirect(flow.url);
  res.cookies.set(GOOGLE_COOKIE, flow.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: FLOW_MS / 1000 });
  return res;
}
