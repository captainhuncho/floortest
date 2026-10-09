import { NextResponse } from "next/server";
import { signViewAs, VIEW_AS_COOKIE } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { q } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { opsSessionLive, redeemViewTicket } from "@/lib/ops";

/**
 * Arrives from ops with a single-use, 60-second ticket and opens that desk read-only for 30 minutes. Only for an admin
 * who still qualifies, from the exact ops session that asked (still live).
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const ticket = t ? await redeemViewTicket(t) : null;
  const admin = ticket
    ? await q.get<{ email: string; email_verified_at: number | null; totp_enabled_at: number | null; suspended_at: number | null }>(
        "SELECT email, email_verified_at, totp_enabled_at, suspended_at FROM users WHERE id = ?",
        ticket.admin_id,
      )
    : null;
  const ok = ticket && admin && isAdminEmail(admin.email) && admin.email_verified_at && admin.totp_enabled_at && !admin.suspended_at && (await opsSessionLive(ticket.session_hash, ticket.admin_id));
  if (!ok) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(new URL("/dashboard/floor", env.appUrl));
  res.cookies.set(VIEW_AS_COOKIE, signViewAs(ticket.admin_id, ticket.user_id, ticket.session_hash, env.secret), { httpOnly: true, sameSite: "lax", secure: isProd, path: "/dashboard", maxAge: 30 * 60 });
  return res;
}
