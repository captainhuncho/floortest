import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runDigests } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily on Vercel Hobby, hourly where available: digests and quiet-hours catch-up emails. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ digestsSent: await runDigests() });
}
