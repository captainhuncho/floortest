import "server-only";
import { now, q } from "./db";
import { env } from "./env";
import { hashRecovery, newRecoveryCodes, openSecret, verifyTotp } from "./totp";

/**
 * Turns two-factor on with the first code from the authenticator. Returns the recovery codes (shown once) or the error.
 * Only for a confirmed email: until then whoever created the account may not own the address, and their authenticator
 * would stand in the real owner's way. Passkeys follow the same rule.
 */
export async function turnOnTwoFactor(userId: number, code: string): Promise<{ codes: string[] } | { error: string }> {
  const row = await q.get<{ totp_secret: string | null; email_verified_at: number | null }>(
    "SELECT totp_secret, email_verified_at FROM users WHERE id = ? AND totp_enabled_at IS NULL",
    userId,
  );
  if (row && !row.email_verified_at) return { error: "Confirm your email first. Check your inbox for the confirmation link." };
  if (!row?.totp_secret) return { error: "Start again: set-up expired." };
  const step = verifyTotp(openSecret(row.totp_secret, env.secret), String(code || ""), null);
  if (step == null) return { error: "That code didn't match. Check the time on your phone and try the newest code." };
  const codes = newRecoveryCodes();
  // The email check is repeated here, so a change between the read and the write can't slip through.
  const on = await q.run(
    "UPDATE users SET totp_enabled_at = ?, totp_last_step = ?, recovery_codes = ? WHERE id = ? AND totp_enabled_at IS NULL AND email_verified_at IS NOT NULL",
    now(),
    step,
    JSON.stringify(codes.map(hashRecovery)),
    userId,
  );
  if (!on.changes) return { error: "Start again: set-up expired." };
  return { codes };
}
