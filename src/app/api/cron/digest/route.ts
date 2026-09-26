import { NextResponse } from "next/server";
import { runDigests } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Run hourly (e.g. Vercel Cron: "0 * * * *"). Protected by CRON_SECRET, sent as
 * "Authorization: Bearer <secret>". Without a secret it only runs outside production.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : process.env.NODE_ENV !== "production";
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ digestsSent: await runDigests() });
}
