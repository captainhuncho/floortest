import "server-only";
import { now, q } from "./db";
import { recentCount, record } from "./ratelimit";
import { botCheckKey } from "./turnstile";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WINDOW = 15 * MINUTE;
const pair = (email: string, ip: string) => `${ip}|${email}`;

/**
 * The hard stops on password sign-in (wrong tries only, so normal logins never count). "connection": 20 wrong from one
 * connection in 15 minutes, for any email (the IP rate limit). "email": only with the human check switched off, 10 wrong
 * for one email from anywhere; with it on there's no stop for one email from everywhere, or a stranger could lock the
 * owner out by typing their email: one email from one connection gets the growing holds below, and past a few wrong
 * tries for an email every connection has to pass the human check (lib/human-check).
 */
export async function loginLocked(email: string, ip: string): Promise<"connection" | "email" | null> {
  if ((await recentCount("login_fail_ip", ip, WINDOW)) >= 20) return "connection";
  return !(await botCheckKey()) && (await recentCount("login_fail_email", email, WINDOW)) >= 10 ? "email" : null;
}

/** One wrong password: counted for the connection, the email (for the human check) and the two together (the holds). */
export async function recordLoginFailure(email: string, ip: string) {
  await record("login_fail_ip", ip);
  await record("login_fail_email", email);
  return afterWrongPassword("login", email, ip);
}

/**
 * Growing holds on one email from one connection (owner, 2 Nov): 5 wrong passwords start a 2-minute hold, and each hold
 * after that is longer, up to 24 hours. Never permanent, and never on the account itself: a stranger typing someone's
 * email holds only their own connection, and the owner can still reset the password, use an email code or a passkey.
 * A hold looks the same whether or not the email has an account, so it can't tell anyone which ones do.
 */
export const HOLD_AFTER = 5;
export const HOLD_STEPS = [2 * MINUTE, 5 * MINUTE, 15 * MINUTE, HOUR, 24 * HOUR];
/** How long after a hold ends the next one still goes a step further; after that the steps start over. */
const HOLD_MEMORY = 24 * HOUR;
/** Each hold is stored with its step in the bucket name, so its length is fixed when it starts (rate_events keeps two days). */
const holdBucket = (kind: SignIn, step: number) => `${kind}_hold_${step}`;
const HOLD_BUCKETS = (kind: SignIn) => HOLD_STEPS.map((_, step) => holdBucket(kind, step));

/** A hold in force: when it ends, and whether it's the last step (which offers "Report this"). */
export type Hold = { until: number; final: boolean };
/** Which sign-in counts the holds (only the app's today; ops keeps its own stricter stop). */
export type SignIn = "login" | "ops";

/**
 * This connection's newest hold for the email, unless a right password came after it (which starts the steps over),
 * and the time of that last right password.
 */
async function history(kind: SignIn, key: string) {
  const buckets = HOLD_BUCKETS(kind);
  const [ok, last] = await Promise.all([
    q.get<{ t: number | null }>("SELECT MAX(created_at) AS t FROM rate_events WHERE bucket = ? AND key = ?", `${kind}_ok_pair`, key),
    q.get<{ bucket: string; created_at: number }>(
      `SELECT bucket, created_at FROM rate_events WHERE bucket IN (${buckets.map(() => "?").join(",")}) AND key = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      ...buckets,
      key,
    ),
  ]);
  const lastOk = Number(ok?.t ?? 0);
  if (!last || Number(last.created_at) <= lastOk) return { lastOk, hold: null };
  const step = buckets.indexOf(last.bucket);
  return { lastOk, hold: { step, until: Number(last.created_at) + HOLD_STEPS[step], final: step === HOLD_STEPS.length - 1 } };
}

/** The hold on this email from this connection right now, if any. Checked before the password, so a hold stops guesses. */
export async function passwordHold(kind: SignIn, email: string, ip: string, at = now()): Promise<Hold | null> {
  const { hold } = await history(kind, pair(email, ip));
  return hold && at < hold.until ? { until: hold.until, final: hold.final } : null;
}

/**
 * A wrong password for this email from this connection. Counts the wrong tries since the last hold ended (or the last
 * right password, or 15 minutes ago); the fifth starts the next hold, one step longer than the last if that ended within
 * HOLD_MEMORY, and returns it. Two tries at the same moment get the same step, never a jump to the top.
 */
export async function afterWrongPassword(kind: SignIn, email: string, ip: string): Promise<Hold | null> {
  const key = pair(email, ip);
  await record(`${kind}_fail_pair`, key);
  const at = now();
  const { lastOk, hold: prev } = await history(kind, key);
  const since = Math.max(at - WINDOW, prev?.until ?? 0, lastOk);
  const wrong = await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND created_at > ?", `${kind}_fail_pair`, key, since);
  if (Number(wrong?.n ?? 0) < HOLD_AFTER) return null;
  const step = prev && at < prev.until + HOLD_MEMORY ? Math.min(prev.step + 1, HOLD_STEPS.length - 1) : 0;
  await record(holdBucket(kind, step), key);
  return { until: now() + HOLD_STEPS[step], final: step === HOLD_STEPS.length - 1 };
}

/**
 * The sign-in form's answer while a hold is on: the same words for every email, account or not. The time left, not the
 * end time, so a phone whose clock is off still counts down right.
 */
export const holdAnswer = (hold: Hold) => ({
  error: hold.final
    ? "Too many wrong passwords from this device, so password sign-in here is paused for 24 hours. You can still reset your password or sign in with a code sent to your email."
    : "Too many wrong passwords. Try again when the timer ends, or reset your password.",
  holdLeft: Math.max(0, hold.until - now()),
  holdFinal: hold.final,
});

/** A right password from this connection: the wrong tries and holds before it no longer count. */
export async function afterRightPassword(kind: SignIn, email: string, ip: string) {
  await record(`${kind}_ok_pair`, pair(email, ip));
}
