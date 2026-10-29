import { NextResponse } from "next/server";
import { cronAuthorized, recordRun, withJobLease } from "@/lib/cron";
import { recordIncident } from "@/lib/incidents";
import { drainOutbox } from "@/lib/mail";
import { sendDueReceipts } from "@/lib/send-receipts";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Up to this many emails a run; a send waits at most 5 s, and no new one starts after the budget. */
const MAIL_BATCH = 100;
const MAIL_BUDGET_MS = 240_000;

/**
 * Every 10 minutes: sends the email queue (src/lib/mail.ts): receipts of sends whose wait is over (src/lib/send-receipts.ts), the digests and reminders the daily job queued, retries of
 * failed sends, and sends a crash interrupted. With nothing due it does nothing and keeps no history row.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const out = await withJobLease("mail", async () => {
    try {
      // Sends of several tracks whose last track never came: their one receipt email is queued now, then sent below.
      const receipts = await sendDueReceipts();
      const result = { ...(await drainOutbox(MAIL_BATCH, { until: started + MAIL_BUDGET_MS })), ...(receipts ? { receipts } : {}) };
      await recordRun("mail", started, true, result, { history: result.due > 0 || "stuck" in result });
      return NextResponse.json(result);
    } catch (e) {
      await recordIncident("cron_failed", "Email queue job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/mail");
      await recordRun("mail", started, false, { error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "Email queue failed" }, { status: 500 });
    }
  });
  return out ?? NextResponse.json({ skipped: "already running" });
}
