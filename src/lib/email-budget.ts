import "server-only";
import { q } from "./db";
import { recordIncident } from "./incidents";
import { MAIL_LIMITS } from "./mail-quota";
import { allow } from "./ratelimit";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * Most account emails (sign-in codes, resets, confirmations) the whole platform sends in an hour. It follows the email
 * provider's daily limit (MAIL_DAILY_LIMIT): an hourly budget bigger than the day's would never hold anything back.
 */
export const ACCOUNT_EMAIL_CAP = Math.max(20, Number(process.env.ACCOUNT_EMAIL_CAP) || MAIL_LIMITS.day);

/**
 * The share of the daily limit kept for account emails. Emails anyone can trigger for a typed address without signing in
 * (sender codes, share-link codes, /sent links, newsletter confirmations) stop once the rest of the day is used, so
 * they can never spend the codes and resets people need to get into their accounts.
 */
const RESERVED_SHARE = Math.min(0.9, Math.max(0.1, Number(process.env.MAIL_RESERVED_SHARE) || 0.3));
export const PUBLIC_EMAIL_DAY = Math.floor(MAIL_LIMITS.day * (1 - RESERVED_SHARE));

/** "account": sign-in codes, resets, email checks. "public": emails a visitor without an account asks for. */
export type EmailKind = "account" | "public";

/** Emails handed to the provider today (UTC), or being handed over now. */
async function mailedToday(at = Date.now()) {
  const d = new Date(at);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return q.count("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('sent', 'sending') AND last_attempt_at >= ?", dayStart);
}

/**
 * A platform-wide budget for account emails, on top of the per-IP and per-address limits: a botnet spreading requests
 * over many addresses and connections still can't run up the email bill. Over the cap, sending pauses for the hour and
 * ops is alerted once. Track emails (delivered, replies) don't count and keep flowing. Public emails also stop at
 * PUBLIC_EMAIL_DAY for the day (counted from the outbox, and a rolling day of slots so a burst can't race past it).
 */
export async function accountEmailAllowed(kind: EmailKind = "account"): Promise<boolean> {
  if (kind === "public" && ((await mailedToday()) >= PUBLIC_EMAIL_DAY || !(await allow("public_email", "all", PUBLIC_EMAIL_DAY, DAY)))) {
    if (await allow("public_email_alert", "all", 1, DAY))
      await recordIncident("email_failed", `Emails to visitors without an account paused: ${PUBLIC_EMAIL_DAY} of the daily limit (${MAIL_LIMITS.day}) used`, "Sender codes, share-link codes, /sent links and newsletter confirmations wait; sign-in codes and resets keep the rest of the day. Check rate_events for the busiest addresses and IPs, or raise MAIL_DAILY_LIMIT after upgrading the plan.", "", { urgent: true });
    return false;
  }
  if (await allow("account_email", "all", ACCOUNT_EMAIL_CAP, HOUR)) return true;
  if (await allow("account_email_alert", "all", 1, HOUR))
    await recordIncident("email_failed", `Account emails paused: more than ${ACCOUNT_EMAIL_CAP} in the last hour`, "Possible abuse of sign-in, reset or sign-up emails. Sending resumes as the hour rolls over; check rate_events for the busiest addresses and IPs.", "", { urgent: true });
  return false;
}
