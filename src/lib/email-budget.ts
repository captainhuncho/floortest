import "server-only";
import { recordIncident } from "./incidents";
import { allow } from "./ratelimit";

const HOUR = 3_600_000;
/** Most account emails (sign-in codes, resets, confirmations) the whole platform sends in an hour. */
export const ACCOUNT_EMAIL_CAP = Math.max(20, Number(process.env.ACCOUNT_EMAIL_CAP) || 300);

/**
 * A platform-wide budget for account emails, on top of the per-IP and per-address limits: a botnet spreading requests
 * over many addresses and connections still can't run up the email bill. Over the cap, sending pauses for the hour and
 * ops is alerted once. Track emails (delivered, replies) don't count and keep flowing.
 */
export async function accountEmailAllowed(): Promise<boolean> {
  if (await allow("account_email", "all", ACCOUNT_EMAIL_CAP, HOUR)) return true;
  if (await allow("account_email_alert", "all", 1, HOUR))
    await recordIncident("email_failed", `Account emails paused: more than ${ACCOUNT_EMAIL_CAP} in the last hour`, "Possible abuse of sign-in, reset or sign-up emails. Sending resumes as the hour rolls over; check rate_events for the busiest addresses and IPs.", "", { urgent: true });
  return false;
}
