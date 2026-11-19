import "server-only";
import { verifyPassword } from "./auth";
import { q } from "./db";
import { allow } from "./ratelimit";
import { checkSecondFactor } from "./security";
import { revokeAllSessions } from "./sessions";

/**
 * The check before a sensitive change (email, password): the current password, and the
 * two-step code (or a recovery code) when two-step sign-in is on. Shared rate limit, so a stolen session can't
 * guess the password through one form after another. Returns an error to show, or null when it passed.
 */
export async function stepUp(userId: number, password: string, code: string): Promise<string | null> {
  if (!(await allow("step_up", String(userId), 10, 3_600_000))) return "Too many tries. Wait an hour and try again.";
  const row = await q.get<{ password_hash: string; totp_enabled_at: number | null }>("SELECT password_hash, totp_enabled_at FROM users WHERE id = ?", userId);
  if (!row || !(await verifyPassword(password, row.password_hash))) return "That password isn't right.";
  if (row.totp_enabled_at && !(await checkSecondFactor(userId, code.trim()))) return "That two-step code didn't work.";
  return null;
}

/**
 * Deleting the account (owner, 18 Nov: "Password not require for that"): no password, only the two-step code (or a
 * recovery code) when two-step sign-in is on, with its own 10-an-hour limit so tries here can't use up the password
 * step-ups (Safety review, 18 Nov). Typing DELETE FLOORTEST and the 14-day undo are the other guards. Returns an error to show, or null when it passed.
 */
export async function codeStepUp(userId: number, code: string): Promise<string | null> {
  if (!(await allow("delete_step", String(userId), 10, 3_600_000))) return "Too many tries. Wait an hour and try again.";
  const row = await q.get<{ totp_enabled_at: number | null }>("SELECT totp_enabled_at FROM users WHERE id = ?", userId);
  if (!row) return "That two-step code didn't work.";
  if (row.totp_enabled_at && !(await checkSecondFactor(userId, code.trim()))) return "That two-step code didn't work.";
  return null;
}

/**
 * "Sign out everywhere": after the same check, end every session of the account (browsers, the app, the ops area),
 * none kept. A failed check changes nothing and comes back as the error to show; null means every session is gone.
 */
export async function endEverySession(userId: number, password: string, code: string): Promise<string | null> {
  const denied = await stepUp(userId, password, code);
  if (denied) return denied;
  await revokeAllSessions(userId);
  return null;
}
