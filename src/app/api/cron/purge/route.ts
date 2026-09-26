import { NextResponse } from "next/server";
import { purgeExpired } from "@/lib/core";
import { cronAuthorized } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily: retention deletions, abandoned uploads, expired sessions and rate-limit records. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await purgeExpired({ force: true }));
}
