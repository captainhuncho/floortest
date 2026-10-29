import { NextResponse } from "next/server";
import { cronAuthorized, jobProblems } from "@/lib/cron";
import { q } from "@/lib/db";
import { configProblems, env } from "@/lib/env";
import { heldUploads } from "@/lib/held-uploads";
import { ipFrom } from "@/lib/ratelimit";
import { scannerHealth, scanRequired } from "@/lib/scan";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Without the cron secret: liveness for uptime monitors, 200 when the database answers. With it: readiness, which also
 * checks storage (a real storage error, not just a missing file), the virus scanner, the scheduled jobs (failed, late or
 * never run) and configuration (email, backup key, recovery copy, scanner), and is not ok (503) while any of them would
 * break production (Codex review, 19 Oct). Nothing secret is returned.
 */
/**
 * Open (no secret) checks per address per minute: far above any uptime monitor (one every 10 seconds is 6), low enough
 * that nobody can keep the database busy through it. Counted in this server's memory, not the database, so the limit
 * itself costs no query; each server instance keeps its own count.
 */
export const HEALTH_PER_MINUTE = 30;
const WINDOW_MS = 60_000;
const seen = new Map<string, { start: number; n: number }>();

function overLimit(ip: string, at: number) {
  const mine = seen.get(ip);
  if (!mine || at - mine.start >= WINDOW_MS) {
    // Old windows are dropped once there are many addresses, so the map stays small.
    if (seen.size > 10_000) for (const [k, v] of seen) if (at - v.start >= WINDOW_MS) seen.delete(k);
    seen.set(ip, { start: at, n: 1 });
    return 0;
  }
  mine.n++;
  return mine.n > HEALTH_PER_MINUTE ? Math.ceil((mine.start + WINDOW_MS - at) / 1000) : 0;
}

export async function GET(req: Request) {
  const detailed = cronAuthorized(req);
  const wait = detailed ? 0 : overLimit(ipFrom(req.headers), Date.now());
  if (wait) return NextResponse.json({ ok: false, error: "Too many checks. Try again shortly." }, { status: 429, headers: { "Retry-After": String(wait) } });
  const checks: Record<string, string> = {};
  try {
    await q.get("SELECT 1");
    checks.database = "ok";
  } catch (e) {
    checks.database = "error";
    console.error("[health] database", e);
  }
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
  const jobs = detailed ? await jobProblems().catch(() => ["Scheduled jobs couldn't be checked."]) : [];
  if (detailed) checks.jobs = jobs.length ? "problem" : "ok";
  // Uploads waiting for their virus check (src/lib/held-uploads.ts): normal for up to 10 minutes, a problem after an hour.
  const held = detailed ? await heldUploads().catch(() => null) : null;
  if (held) checks.held = String(held.count);
  const stuck = held?.oldest && Date.now() - held.oldest > 3_600_000 ? [`${held.count} upload(s) have waited over an hour for their virus check.`] : [];
  const problems = detailed ? [...configProblems(), ...jobs, ...stuck] : [];
  const scannerFails = checks.scanner === "down" || (checks.scanner === "off" && scanRequired());
  const ok = checks.database === "ok" && checks.storage !== "error" && !problems.length && !scannerFails;
  return NextResponse.json({ ok, checks, ...(detailed ? { problems } : {}) }, { status: ok ? 200 : 503 });
}
