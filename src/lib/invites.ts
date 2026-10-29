import { q } from "@/lib/db";
import { env } from "@/lib/env";

export type InviteCheck = { valid: boolean; referrerId: number | null; code: string | null };

const NONE: InviteCheck = { valid: false, referrerId: null, code: null };
const used = (code: string) => q.count("SELECT COUNT(*) AS n FROM users WHERE invite_code = ?", code);

/**
 * Whether an invite opens an account, and what to record on it (users.invite_code, users.referred_by).
 *
 * Sign-up closed (the beta, owner 29 Oct): only a personal invite from Ops opens an account: one sent to this exact
 * email, not revoked, not used, and with its code from the invite email. Anyone can type someone else's email, so the
 * code is what shows the invite reached this person; a valid one here also confirms the email. `emailProven` (Google
 * sign-up) skips the code, since the email is already proven. Shared codes (Ops or BETA_INVITE_CODES) and referral
 * codes don't open anything, so a leaked code can't let a stranger in.
 *
 * Sign-up open: anyone gets in, and a code only records who referred or invited them.
 */
export async function resolveInvite(raw: string, email: string, open: boolean, opts: { emailProven?: boolean } = {}): Promise<InviteCheck> {
  const code = raw.trim().toUpperCase().slice(0, 32);
  const who = email.trim().toLowerCase();
  if (!open) {
    if (!who || (!code && !opts.emailProven)) return NONE;
    const inv = await q.get<{ code: string }>(
      `SELECT code FROM invites i WHERE lower(i.email) = ? AND i.revoked_at IS NULL ${code ? "AND i.code = ?" : ""}
         AND (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) < i.max_uses
       ORDER BY i.created_at DESC LIMIT 1`,
      ...(code ? [who, code] : [who]),
    );
    return inv ? { valid: true, referrerId: null, code: inv.code } : NONE;
  }
  if (!code) return NONE;
  const referrer = await q.get<{ id: number }>("SELECT id FROM users WHERE referral_code = ?", code);
  if (referrer) return { valid: true, referrerId: referrer.id, code };
  // Codes created in Ops, each with its own cap and a revoke switch; a personal one only for its own email.
  const inv = await q.get<{ max_uses: number; email: string | null }>("SELECT max_uses, email FROM invites WHERE code = ? AND revoked_at IS NULL", code);
  if (inv?.email && inv.email.toLowerCase() !== who) return { ...NONE, code };
  if (inv) return { valid: (await used(code)) < inv.max_uses, referrerId: null, code };
  return { valid: env.inviteCodes.includes(code) && (await used(code)) < env.inviteLimit, referrerId: null, code };
}

/**
 * Shortest code that can open the coming-soon gate: personal invites since 29 Oct are FLOOR- plus 10 characters. Older
 * ones (FLOOR- plus 5 or 6) still sign up with the password, and resending one from Ops swaps in a long code.
 */
export const GATE_CODE_MIN_LENGTH = 16;

/**
 * Whether a code from an invite link is a live personal invite: sent to someone's email, not revoked, not used up, and
 * that email has no account yet. An invite expires once its email finishes signing up, by any route (owner, 29 Oct).
 * While the site is behind the coming-soon password, a live one lets the invited person through to sign-up (owner,
 * 29 Oct); shared and referral codes don't, so a leaked code can't open the site.
 */
export async function liveInviteCode(raw: string) {
  const code = raw.trim().toUpperCase().slice(0, 32);
  if (code.length < GATE_CODE_MIN_LENGTH) return false;
  const inv = await q.get<{ code: string }>(
    `SELECT code FROM invites i WHERE i.code = ? AND i.email IS NOT NULL AND i.revoked_at IS NULL
       AND (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) < i.max_uses
       AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email))`,
    code,
  );
  return !!inv;
}

export type InviteChange = { ok: true; code: string; email: string | null; emails: number } | { ok: false; reason: string };

const cleanCode = (raw: unknown) => String(raw ?? "").trim().toUpperCase().slice(0, 32);

/**
 * Puts a revoked invite back (Ops → Invites → Revoked, owner 29 Oct). A personal invite comes back only while its email
 * has no account and no other live invite, so one person never holds two working codes. Shared codes come back freely.
 */
export async function restoreRevokedInvite(raw: unknown): Promise<InviteChange> {
  const code = cleanCode(raw);
  return q.tx(async (db) => {
    const inv = await db.get<{ code: string; email: string | null }>("SELECT code, email FROM invites WHERE code = ? AND revoked_at IS NOT NULL FOR UPDATE", code);
    if (!inv) return { ok: false, reason: "Couldn't restore: that invite isn't in the Revoked list." };
    if (inv.email) {
      if (await db.get("SELECT 1 FROM users WHERE lower(email) = lower(?)", inv.email))
        return { ok: false, reason: `Couldn't restore: ${inv.email} already has an account.` };
      const other = await db.get(
        `SELECT 1 FROM invites i WHERE lower(i.email) = lower(?) AND i.code <> ? AND i.revoked_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.invite_code = i.code)`,
        inv.email,
        inv.code,
      );
      if (other) return { ok: false, reason: `Couldn't restore: ${inv.email} already has another invite waiting. Revoke that one first.` };
    }
    await db.run("UPDATE invites SET revoked_at = NULL WHERE code = ? AND revoked_at IS NOT NULL", inv.code);
    return { ok: true, code: inv.code, email: inv.email, emails: 0 };
  });
}

/**
 * Deletes a revoked invite for good (owner, 29 Oct): the invite row and the invite emails that carry its code (the
 * stored copy in the outbox, and the sealed text if it hadn't gone yet), in one transaction. Refused while anyone has
 * signed up with the code, since their account records it. Ops log lines stay: removing those needs the owner's own yes.
 */
export async function deleteRevokedInvite(raw: unknown): Promise<InviteChange> {
  const code = cleanCode(raw);
  return q.tx(async (db) => {
    const inv = await db.get<{ code: string; email: string | null }>("SELECT code, email FROM invites WHERE code = ? AND revoked_at IS NOT NULL FOR UPDATE", code);
    if (!inv) return { ok: false, reason: "Couldn't delete: only an invite in the Revoked list can be deleted." };
    if (await db.get("SELECT 1 FROM users WHERE invite_code = ?", inv.code))
      return { ok: false, reason: `Couldn't delete ${inv.code}: an account signed up with it and keeps it on record.` };
    const emails = inv.email
      ? (await db.run("DELETE FROM outbox WHERE lower(to_email) = lower(?) AND strpos(body, ?) > 0", inv.email, inv.code)).changes
      : 0;
    await db.run("DELETE FROM invites WHERE code = ? AND revoked_at IS NOT NULL", inv.code);
    return { ok: true, code: inv.code, email: inv.email, emails };
  });
}
