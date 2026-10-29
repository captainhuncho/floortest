import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { recordIncident } from "./incidents";

/**
 * A daily budget for the virus scanner (audit, 29 Oct). The scanner's container is billed while it runs, and every scan
 * keeps it running for another 10 minutes (sleepAfter in scanner/cloudflare/index.js). Senders cause those runs: a
 * confirmed email can finish an upload every few minutes, and nothing else capped how long that kept the scanner up.
 *
 * Every wake-up and every scan is charged here before it is sent, to the whole platform and to the sender's email:
 *
 *   wakes      a charge when the scanner was asleep (as far as our own charges know)
 *   minutes    how much longer the charge keeps it running: up to 10 per charge, less when it was already up
 *
 * Over the budget, nothing is sent to the scanner: the upload is held (never accepted unscanned) and the held-uploads
 * job tries it again with the next day's budget (days are UTC). Ops gets one incident per day for each budget that runs
 * out. The owner can raise the limits with the env settings below; a held upload still runs out after HELD_TTL.
 */
export const SCANNER_AWAKE_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** The day's limits, read on each charge so a changed setting applies at once. */
export const scanBudget = () => ({
  wakes: limit("SCAN_BUDGET_WAKES", 144),
  minutes: limit("SCAN_BUDGET_MINUTES", 720),
  senderWakes: limit("SCAN_BUDGET_SENDER_WAKES", 12),
  senderMinutes: limit("SCAN_BUDGET_SENDER_MINUTES", 60),
});

/**
 * One budget per mailbox: case and "+tag" variants of an address share it. Kept as a hash, so the table holds no email.
 * Uploads without an email (a stem whose track has no sender) are charged to their desk.
 */
export function senderScope(email: string | null | undefined, receiverId: number) {
  const e = email?.trim().toLowerCase();
  if (!e?.includes("@")) return `desk:${receiverId}`;
  const at = e.lastIndexOf("@");
  const mailbox = `${e.slice(0, at).split("+")[0]}${e.slice(at)}`;
  return `sender:${crypto.createHash("sha256").update(mailbox).digest("base64url")}`;
}

type Row = { wakes: number; awake_ms: number; awake_until: number; spent_at: number | null };
export type ScanCharge = { ok: true } | { ok: false; scope: "all" | "sender" };

/**
 * Charges one scanner call (a wake-up or a scan) to the platform and to `scope` (from senderScope), or refuses it when
 * either budget can't cover it. Both rows are locked, so calls at the same moment can't overshoot together.
 */
export async function chargeScanner(scope: string, at = now()): Promise<ScanCharge> {
  // No scanner configured (a preview or a local copy): nothing is sent, so nothing is charged.
  if (!process.env.SCAN_URL?.trim()) return { ok: true };
  const day = new Date(at).toISOString().slice(0, 10);
  const lim = scanBudget();
  const result = await q.tx(async (db) => {
    await db.run("INSERT INTO scanner_budget (day, scope) VALUES (?, 'all'), (?, ?) ON CONFLICT (day, scope) DO NOTHING", day, day, scope);
    const get = (s: string) => db.get<Row>("SELECT wakes, awake_ms, awake_until, spent_at FROM scanner_budget WHERE day = ? AND scope = ? FOR UPDATE", day, s);
    const all = (await get("all"))!;
    const mine = (await get(scope))!;
    const until = Number(all.awake_until);
    const wake = until <= at ? 1 : 0;
    // Only the minutes this call adds: the scanner may already be running from an earlier charge.
    const adds = at + SCANNER_AWAKE_MS - Math.max(until, at);
    const over = (r: Row, wakes: number, minutes: number) => Number(r.wakes) + wake > wakes || Number(r.awake_ms) + adds > minutes * 60_000;
    const out = over(all, lim.wakes, lim.minutes) ? "all" : over(mine, lim.senderWakes, lim.senderMinutes) ? "sender" : null;
    if (out) {
      const spent = out === "all" ? all : mine;
      await db.run("UPDATE scanner_budget SET spent_at = ? WHERE day = ? AND scope = ? AND spent_at IS NULL", at, day, out === "all" ? "all" : scope);
      return { ok: false as const, scope: out, first: spent.spent_at == null };
    }
    await db.run("UPDATE scanner_budget SET wakes = wakes + ?, awake_ms = awake_ms + ?, awake_until = ? WHERE day = ? AND scope = 'all'", wake, adds, at + SCANNER_AWAKE_MS, day);
    await db.run("UPDATE scanner_budget SET wakes = wakes + ?, awake_ms = awake_ms + ? WHERE day = ? AND scope = ?", wake, adds, day, scope);
    return { ok: true as const, wake };
  });
  // Days before last week are no longer needed: cleared as each wake-up is charged.
  if (result.ok && result.wake) await q.run("DELETE FROM scanner_budget WHERE day < ?", new Date(at - 7 * DAY_MS).toISOString().slice(0, 10));
  if (result.ok) return { ok: true };
  if (result.first) {
    const all = result.scope === "all";
    await recordIncident(
      "upload_failed",
      all ? "The virus scanner's daily budget is spent; uploads are held until tomorrow" : "One sender used up their daily virus-check budget; their uploads are held until tomorrow",
      `${all ? `${lim.wakes} wake-ups / ${lim.minutes} minutes a day for everyone` : `${lim.senderWakes} wake-ups / ${lim.senderMinutes} minutes a day per sender (${scope.slice(0, 20)})`}. Raise SCAN_BUDGET_* to let more through today.`,
      "scanner budget",
      { urgent: all },
    );
  }
  return { ok: false, scope: result.scope };
}
