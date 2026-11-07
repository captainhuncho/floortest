import "server-only";
import { q } from "./db";
import { record } from "./ratelimit";
import { afterRightPassword, afterWrongPassword, claimTry, holdAnswer, passwordHold } from "./login-limits";
import { alertGuessedAccount } from "./login-alert";

/** Counted per account, from any device: only someone with the right password gets this far. */
const who = (userId: number) => `user:${userId}`;
const ANY = "*";

export type TwoStepHeld = ReturnType<typeof holdAnswer>;

/**
 * One two-step try (code, recovery code or passkey) after a right password, on the website, the app and ops. Sign-in
 * audit M5 (6 Nov): a flat 8 tries in 15 minutes let someone who has the password keep guessing for ever. Now the same
 * growing holds as wrong passwords (5 wrong, then 2 minutes, 5, 15, an hour, 24 hours), per account, and when a hold
 * starts the owner hears that their password is known. The try is counted before `check` runs, so tries sent at the same
 * moment can't all slip in; a right answer hands its place back. Wrong tries still go on Admin → Security (twofa_fail).
 * A hold can lock out only someone who already has the password: the owner, warned by email, changes it.
 */
export async function guardTwoStep<T>(userId: number, check: () => Promise<T>): Promise<{ result: T } | { held: TwoStepHeld } | { wrong: true }> {
  const key = who(userId);
  const hold = await passwordHold("twofa", key, ANY);
  if (hold) return { held: holdAnswer(hold, "twofa") };
  const attempt = await claimTry("twofa", key, ANY);
  if (attempt.hold) return { held: holdAnswer(attempt.hold, "twofa") };
  const result = await check();
  if (result) {
    await afterRightPassword("twofa", key, ANY, attempt);
    return { result };
  }
  await record("twofa_fail", key);
  const started = await afterWrongPassword("twofa", key, ANY, { claimed: true });
  if (!started) return { wrong: true };
  const u = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
  if (u) alertGuessedAccount(u.email, started, "twofa");
  return { held: holdAnswer(started, "twofa") };
}
