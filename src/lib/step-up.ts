import "server-only";
import { verifyPassword } from "./auth";
import { q } from "./db";
import { allow } from "./ratelimit";
import { checkSecondFactor } from "./security";

/**
 * The check before a sensitive change (email, password, deleting the account): the current password, and the
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
