import "server-only";
import { recentCount, record } from "./ratelimit";
import { botCheckKey } from "./turnstile";

const WINDOW = 15 * 60_000;
const pair = (email: string, ip: string) => `${ip}|${email}`;

/**
 * The hard stop on password sign-in (wrong tries only, so normal logins never count): 20 from one connection, or 10 for
 * one email from one connection, in 15 minutes. Not 10 for one email from anywhere: then a stranger could lock the owner
 * out by typing their email with wrong passwords. Past a few wrong tries for an email, every connection has to pass the
 * human check instead (lib/human-check). With that check off there is nothing to ask for, so the per-email stop stays.
 */
export async function loginLocked(email: string, ip: string) {
  if ((await recentCount("login_fail_ip", ip, WINDOW)) >= 20) return true;
  if ((await recentCount("login_fail_pair", pair(email, ip), WINDOW)) >= 10) return true;
  return !(await botCheckKey()) && (await recentCount("login_fail_email", email, WINDOW)) >= 10;
}

/** One wrong password: counted for the connection, the email (for the human check) and the two together. */
export async function recordLoginFailure(email: string, ip: string) {
  await record("login_fail_ip", ip);
  await record("login_fail_email", email);
  await record("login_fail_pair", pair(email, ip));
}
