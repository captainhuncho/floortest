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

/** One wrong password, after claimTry: counted for the connection, the email and the two together; may start a hold. */
export async function recordLoginFailure(email: string, ip: string) {
  return afterWrongPassword("login", email, ip, { claimed: true });
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
/**
 * Which sign-in counts the holds: the app's (wrong passwords), ops' (failed sign-ins, password or two-step code), or the
 * two-step code after a right password on the website, the app and ops (per account, lib/two-step-limits); each on its own.
 */
export type SignIn = "login" | "ops" | "twofa";

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

/** The wrong tries in this round (since the last hold ended, the last right password, or 15 minutes ago) and the last hold. */
async function round(kind: SignIn, key: string) {
  const at = now();
  const { lastOk, hold: prev } = await history(kind, key);
  const since = Math.max(at - WINDOW, prev?.until ?? 0, lastOk);
  const wrong = await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND created_at > ?", `${kind}_fail_pair`, key, since);
  return { at, prev, wrong: Number(wrong?.n ?? 0) };
}

/** Starts the next hold: one step longer than the last if that ended within HOLD_MEMORY, else the first step. */
async function startHold(kind: SignIn, key: string, prev: { step: number; until: number } | null, at: number): Promise<Hold> {
  const step = prev && at < prev.until + HOLD_MEMORY ? Math.min(prev.step + 1, HOLD_STEPS.length - 1) : 0;
  await record(holdBucket(kind, step), key);
  return { until: now() + HOLD_STEPS[step], final: step === HOLD_STEPS.length - 1 };
}

/** One try's place in the counters, from claimTry: the rows to hand back if the password turns out right. */
export type Try = { ids: number[]; hold: Hold | null };

/**
 * Takes this try's place before anything is checked (Safety review, 2 Nov): counted for the connection, the email and
 * the two together, so tries sent at the same moment can't all slip past the counts before any is recorded. If earlier
 * tries in flight have already used up this round, it answers with the hold and nothing more is tried. A right password
 * hands the place back (afterRightPassword), so it's never counted as wrong.
 */
export async function claimTry(kind: SignIn, email: string, ip: string): Promise<Try> {
  const key = pair(email, ip);
  const ids: number[] = [];
  for (const [bucket, k] of [[`${kind}_fail_ip`, ip], [`${kind}_fail_email`, email], [`${kind}_fail_pair`, key]]) {
    const row = await q.get<{ id: number }>("INSERT INTO rate_events (bucket, key, created_at) VALUES (?,?,?) RETURNING id", bucket, k, now());
    if (row) ids.push(row.id);
  }
  const { at, prev, wrong } = await round(kind, key);
  return { ids, hold: wrong > HOLD_AFTER ? await startHold(kind, key, prev, at) : null };
}

/**
 * A wrong password (or, on ops, any failed sign-in) for this email from this connection. The fifth wrong try in a round
 * starts the next hold and returns it. Tries at the same moment get the same step, never a jump to the top. `claimed`:
 * claimTry already counted this try.
 */
export async function afterWrongPassword(kind: SignIn, email: string, ip: string, { claimed = false } = {}): Promise<Hold | null> {
  const key = pair(email, ip);
  if (!claimed) await record(`${kind}_fail_pair`, key);
  const { at, prev, wrong } = await round(kind, key);
  return wrong < HOLD_AFTER ? null : startHold(kind, key, prev, at);
}

/**
 * The sign-in form's answer while a hold is on: the same words for every email, account or not. The time left, not the
 * end time, so a phone whose clock is off still counts down right. Ops counts failed sign-ins (password or two-step code)
 * and never says which part was wrong; its form has no "Report this" (the contact page isn't on the ops host).
 */
export const holdAnswer = (hold: Hold, kind: SignIn = "login") => {
  const holdLeft = Math.max(0, hold.until - now());
  if (kind === "twofa")
    return {
      error: hold.final
        ? "Too many wrong codes, so two-step sign-in for this account is paused for 24 hours."
        : "Too many wrong codes. Try again when the timer ends.",
      holdLeft,
      holdFinal: false,
    };
  if (kind === "ops")
    return {
      error: hold.final
        ? "Too many failed sign-ins from this device, so ops sign-in here is paused for 24 hours. Ask the owner if you need in sooner."
        : "Too many failed sign-ins. Try again when the timer ends.",
      holdLeft,
      holdFinal: false,
    };
  return {
    error: hold.final
      ? "Too many wrong passwords from this device, so password sign-in here is paused for 24 hours. You can still reset your password or sign in with a code sent to your email."
      : "Too many wrong passwords. Try again when the timer ends, or reset your password.",
    holdLeft,
    holdFinal: hold.final,
  };
};

/** A right password from this connection: its own claimed place is handed back, and the wrong tries and holds before it no longer count. */
export async function afterRightPassword(kind: SignIn, email: string, ip: string, claimed?: Try) {
  if (claimed?.ids.length) await q.run(`DELETE FROM rate_events WHERE id IN (${claimed.ids.map(() => "?").join(",")})`, ...claimed.ids);
  await record(`${kind}_ok_pair`, pair(email, ip));
}
