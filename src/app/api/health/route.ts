import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { q } from "@/lib/db";
import { configProblems, env } from "@/lib/env";
import { scannerHealth, scanRequired } from "@/lib/scan";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Without the cron secret: liveness for uptime monitors, 200 when the database answers. With it: readiness, which also
 * checks storage, the virus scanner and configuration, and is not ok (503) while any of them would break production,
 * for example a live site with no scanner (Codex review, 19 Oct). Nothing secret is returned.
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
    checks.scanner = await scannerHealth();
  }
  const problems = detailed ? configProblems() : [];
  const scannerFails = checks.scanner === "down" || (checks.scanner === "off" && scanRequired());
  const ok = checks.database === "ok" && checks.storage !== "error" && !problems.length && !scannerFails;
  return NextResponse.json({ ok, checks, ...(detailed ? { problems } : {}) }, { status: ok ? 200 : 503 });
}
