import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { breachedError } from "./breached";
import { hashPassword } from "./password-hash";
import { allow } from "./ratelimit";
import { revokeAllSessions } from "./sessions";
import { hashToken } from "./token-hash";

/**
 * Setting a new password, by reset link or from the Security page. Kept apart from auth.ts (which needs a request) so
 * the tests can run it. Both ways end every other session through `revokeAllSessions`, ops sessions included.
 */
const RESET_MS = 1000 * 60 * 60;

/** A one-hour, single-use reset link. Returns the raw token, which is only ever emailed. */
export async function createPasswordReset(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  await q.run("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)", hashToken(token), userId, now() + RESET_MS, now());
  return token;
}

export async function findPasswordReset(token: string) {
  return q.get<{ user_id: number }>(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    hashToken(token),
    now(),
  );
}

const EXPIRED = "This reset link has expired or was already used. Request a new one.";
const SUBMITS_PER_HOUR = 20;

/**
 * The reset form, sent. The link and a per-connection limit are checked first, so a made-up or spent link costs no
 * breach lookup and no slow hash. `leaked` is the breach check (swapped in tests).
 */
export async function resetWithLink(token: string, newPassword: string, ip: string, leaked: (p: string) => Promise<string | null> = breachedError): Promise<{ userId: number } | { error: string }> {
  if (!(await allow("reset_submit_ip", ip, SUBMITS_PER_HOUR, RESET_MS))) return { error: "Too many tries. Wait an hour and try again." };
  if (!(await findPasswordReset(token))) return { error: EXPIRED };
  const bad = await leaked(newPassword); // before the link is used up, so they can pick another with it
  if (bad) return { error: bad };
  const userId = await consumePasswordReset(token, newPassword);
  return userId ? { userId } : { error: EXPIRED };
}

/**
 * Sets the new password and signs the account out everywhere. Returns the user id, or null if the link is no good.
 * The link reached the inbox, so it also confirms the email. If the account wasn't confirmed, whoever created it may not
 * be this person: like the email sign-in code, it clears the two-factor and passkeys they set up.
 */
export async function consumePasswordReset(token: string, newPassword: string) {
  const newHash = await hashPassword(newPassword); // before the transaction, so the slow hash doesn't hold it open
  return q.tx(async (db) => {
    const r = await db.get<{ user_id: number }>(
      "UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id",
      now(),
      hashToken(token),
      now(),
    );
    if (!r) return null;
    const unconfirmed = await db.get(
      "UPDATE users SET email_verified_at = ?, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ? AND email_verified_at IS NULL RETURNING id",
      now(),
      r.user_id,
    );
    if (unconfirmed) await db.run("DELETE FROM passkeys WHERE user_id = ?", r.user_id);
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", newHash, r.user_id);
    await revokeAllSessions(r.user_id, { db });
    return r.user_id;
  });
}

/** A password change from the Security page: the new password, and every session but `keep` (this browser) ends. */
export async function changePasswordTo(userId: number, newPassword: string, keep: string | null) {
  const newHash = await hashPassword(newPassword);
  return q.tx(async (db) => {
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", newHash, userId);
    return revokeAllSessions(userId, { keep, db });
  });
}
