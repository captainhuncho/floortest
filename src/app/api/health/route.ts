import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { q } from "@/lib/db";
import { configProblems, env } from "@/lib/env";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness for uptime monitors: 200 when the database answers. With the cron secret it also
 * reports storage reachability and configuration problems.
 */
export async function GET(req: Request) {
  const checks: Record<string, string> = {};
  try {
    await q.get("SELECT 1");
    checks.database = "ok";
  } catch (e) {
    checks.database = "error";
    console.error("[health] database", e);
  }
  const detailed = cronAuthorized(req);
  if (detailed) {
    try {
      await (await storage()).head("health-check-probe");
      checks.storage = `ok (${env.storage.driver})`;
    } catch (e) {
      checks.storage = "error";
      console.error("[health] storage", e);
    }
    checks.email = env.email.resendKey ? "resend" : "log only";
  }
  const ok = checks.database === "ok" && checks.storage !== "error";
  return NextResponse.json({ ok, checks, ...(detailed ? { problems: configProblems() } : {}) }, { status: ok ? 200 : 503 });
}
