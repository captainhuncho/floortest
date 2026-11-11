import crypto from "node:crypto";
import { now, q, type Queryable } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/token-hash";

/** `personal`: a single-use invite sent to one email, which signing up marks used (claimPersonalInvite). */
export type InviteCheck = { valid: boolean; referrerId: number | null; code: string | null; personal?: boolean };

const NONE: InviteCheck = { valid: false, referrerId: null, code: null };

/** How long a personal invite lasts once sent (owner, 5 Nov); Resend from Ops gives it a fresh 14 days. */
export const INVITE_DAYS = 14;
export const inviteExpiry = (from = now()) => from + INVITE_DAYS * 86_400_000;

/**
 * SQL for a personal invite (alias i) that can still open an account: not revoked, not used, not expired. Used is a
 * mark on the invite itself, so deleting the account made with it never brings the invite back.
 */
const LIVE = `i.revoked_at IS NULL AND i.used_at IS NULL AND COALESCE(i.expires_at, i.created_at + ${INVITE_DAYS * 86_400_000}) > ?`;
/**
 * How an invite code is stored (owner, 11 Nov): only its SHA-256, in `code_hash` and, for a new invite, as the row's
 * `code` too (the id users.invite_code and Ops use), plus the last 4 characters in `code_hint` for Ops to show. A copy of
 * the database holds nothing that opens an account. Rows made before migration 0140 still hold the plain code in `code`
 * until the follow-up clears it (owner's yes); a row an older build writes during a deploy has no hash yet and is
 * found by its plain code. Codes are compared in capitals.
 */
export const cleanInviteCode = (raw: unknown) => String(raw ?? "").trim().toUpperCase().slice(0, 32);
export function matchInviteCode(raw: unknown, alias = "i") {
  const code = cleanInviteCode(raw);
  return { sql: `(${alias}.code_hash = ? OR (${alias}.code_hash IS NULL AND ${alias}.code = ?))`, args: [hashToken(code), code] as unknown[] };
}

/** What a new invite stores for a code it emails or shows once: never the code itself. */
export function inviteKeys(plain: string) {
  const h = hashToken(cleanInviteCode(plain));
  return { code: h, codeHash: h, hint: cleanInviteCode(plain).slice(-4) };
}

/** How Ops names an invite: its last 4 characters ("…7QK2"). */
export const inviteLabel = (code: string, hint?: string | null) => `…${hint || code.slice(-4)}`;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/**
 * A new personal invite code: FLOOR- and 16 characters from 32 (80 bits), so its stored hash can't be worked back
 * to the code by trying them all. The code is what proves the email while sign-up is closed.
 */
export const newInviteCode = (length = 16) => `FLOOR-${Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

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
  const code = cleanInviteCode(raw);
  const who = email.trim().toLowerCase();
  const m = matchInviteCode(code);
  if (!open) {
    if (!who || (!code && !opts.emailProven)) return NONE;
    const inv = await q.get<{ code: string }>(
      `SELECT code FROM invites i WHERE lower(i.email) = ? AND ${LIVE} ${code ? `AND ${m.sql}` : ""}
         AND (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) < i.max_uses
       ORDER BY i.created_at DESC LIMIT 1`,
      ...(code ? [who, now(), ...m.args] : [who, now()]),
    );
    return inv ? { valid: true, referrerId: null, code: inv.code, personal: true } : NONE;
  }
  if (!code) return NONE;
  const referrer = await q.get<{ id: number }>("SELECT id FROM users WHERE referral_code = ?", code);
  if (referrer) return { valid: true, referrerId: referrer.id, code };
  // Codes created in Ops, each with its own cap and a revoke switch; a personal one only for its own email. What's
  // recorded is the invite's id (its hash), never the typed code.
  const inv = await q.get<{ code: string; max_uses: number; email: string | null; live: boolean }>(
    `SELECT code, max_uses, email, (${LIVE}) AS live FROM invites i WHERE ${m.sql} AND revoked_at IS NULL`,
    now(),
    ...m.args,
  );
  if (inv?.email && (inv.email.toLowerCase() !== who || !inv.live)) return { ...NONE, code: inv.code };
  if (inv) return { valid: (await used(inv.code)) < inv.max_uses, referrerId: null, code: inv.code, personal: !!inv.email };
  return { valid: env.inviteCodes.includes(code) && (await used(code)) < env.inviteLimit, referrerId: null, code };
}

/**
 * A new personal invite for `email`, stored as its hash; the code itself goes only into the email. Returns the code to
 * email, the invite's id and how Ops names it.
 */
export async function addPersonalInvite(email: string, note: string, db: Queryable = q) {
  const code = newInviteCode();
  const k = inviteKeys(code);
  await db.run(
    "INSERT INTO invites (code, code_hash, code_hint, max_uses, note, email, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)",
    k.code, k.codeHash, k.hint, 1, note, email, now(), inviteExpiry(),
  );
  return { code, id: k.code, label: inviteLabel(k.code, k.hint) };
}

/**
 * Ops → Resend: only a code's hash is stored, so a resend always makes a new code (with a fresh 14 days) and revokes the
 * old one, in one transaction. The old one is revoked only while it's still live, so two Resends at once can't leave two
 * working codes (Safety, #512 round 1): the second gets null and makes nothing.
 */
export async function swapPersonalInvite(oldId: string, email: string, note: string) {
  return q.tx(async (db) => {
    const revoked = await db.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL AND used_at IS NULL", now(), oldId);
    return revoked.changes ? addPersonalInvite(email, note, db) : null;
  });
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
  const code = cleanInviteCode(raw);
  if (code.length < GATE_CODE_MIN_LENGTH) return false;
  const m = matchInviteCode(code);
  const inv = await q.get<{ code: string }>(
    `SELECT code FROM invites i WHERE ${m.sql} AND i.email IS NOT NULL AND ${LIVE}
       AND (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) < i.max_uses
       AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email))`,
    ...m.args,
    now(),
  );
  return !!inv;
}

/**
 * Whether a code is a personal invite that can no longer open an account: used, expired, revoked, or its email already
 * has an account (owner, 5 Nov). The invite link and the sign-up page then show "This invite has been used or has
 * expired" instead of a form that looks live. One answer for all of these, so the page never says which. Unknown and
 * shared codes return false: they never showed an invite in the first place.
 */
export async function personalInviteGone(raw: string) {
  const code = cleanInviteCode(raw);
  if (!code) return false;
  const m = matchInviteCode(code);
  const inv = await q.get<{ email: string; live: boolean; joined: boolean }>(
    `SELECT i.email, (${LIVE}) AS live, EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email)) AS joined
       FROM invites i WHERE ${m.sql} AND i.email IS NOT NULL`,
    now(),
    ...m.args,
  );
  return !!inv && (!inv.live || inv.joined);
}

/**
 * Inside the sign-up transaction: marks the personal invite used, once. False when another sign-up claimed it first
 * (or it was revoked or ran out meanwhile), and the caller rolls the account back. Every other invite still waiting for
 * this email is marked used too: the person is in, whichever link they came by (owner, 29 Oct).
 */
export async function claimPersonalInvite(db: Queryable, code: string | null, email: string) {
  const t = now();
  const claimed = code
    ? await db.get(`UPDATE invites i SET used_at = ? WHERE i.code = ? AND i.email IS NOT NULL AND ${LIVE} RETURNING i.code`, t, code, t)
    : true;
  await db.run("UPDATE invites SET used_at = ? WHERE lower(email) = lower(?) AND used_at IS NULL", t, email);
  return !!claimed;
}

/** `code` is the invite's id (from Ops' own buttons, never typed); `label` is how Ops names it. */
export type InviteChange = { ok: true; code: string; label: string; email: string | null; emails: number } | { ok: false; reason: string };

/** An invite id from an Ops button: the hex hash of a new invite, or an old invite's plain code (capitals). */
const cleanCode = (raw: unknown) => {
  const s = String(raw ?? "").trim().slice(0, 64);
  return /^[0-9a-f]{64}$/.test(s) ? s : s.toUpperCase().slice(0, 32);
};

/**
 * Puts a revoked invite back (Ops → Invites → Revoked, owner 29 Oct). A personal invite comes back only while its email
 * has no account and no other live invite, so one person never holds two working codes. Shared codes come back freely.
 */
export async function restoreRevokedInvite(raw: unknown): Promise<InviteChange> {
  const code = cleanCode(raw);
  return q.tx(async (db) => {
    const inv = await db.get<{ code: string; code_hint: string; email: string | null; used_at: number | null }>(
      "SELECT code, code_hint, email, used_at FROM invites WHERE code = ? AND revoked_at IS NOT NULL FOR UPDATE",
      code,
    );
    if (!inv) return { ok: false, reason: "Couldn't restore: that invite isn't in the Revoked list." };
    if (inv.used_at) return { ok: false, reason: "Couldn't restore: that invite was already used to sign up." };
    if (inv.email) {
      if (await db.get("SELECT 1 FROM users WHERE lower(email) = lower(?)", inv.email))
        return { ok: false, reason: `Couldn't restore: ${inv.email} already has an account.` };
      const other = await db.get(
        `SELECT 1 FROM invites i WHERE lower(i.email) = lower(?) AND i.code <> ? AND ${LIVE}
           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.invite_code = i.code)`,
        inv.email,
        inv.code,
        now(),
      );
      if (other) return { ok: false, reason: `Couldn't restore: ${inv.email} already has another invite waiting. Revoke that one first.` };
    }
    // A restored personal invite gets a fresh 14 days, as a resend would.
    await db.run("UPDATE invites SET revoked_at = NULL, expires_at = ? WHERE code = ? AND revoked_at IS NOT NULL", inv.email ? inviteExpiry() : null, inv.code);
    return { ok: true, code: inv.code, label: inviteLabel(inv.code, inv.code_hint), email: inv.email, emails: 0 };
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
    const inv = await db.get<{ code: string; code_hint: string; email: string | null; outbox_id: number | null }>(
      "SELECT code, code_hint, email, outbox_id FROM invites WHERE code = ? AND revoked_at IS NOT NULL FOR UPDATE",
      code,
    );
    if (!inv) return { ok: false, reason: "Couldn't delete: only an invite in the Revoked list can be deleted." };
    const label = inviteLabel(inv.code, inv.code_hint);
    if (await db.get("SELECT 1 FROM users WHERE invite_code = ?", inv.code))
      return { ok: false, reason: `Couldn't delete ${label}: an account signed up with it and keeps it on record.` };
    // A new invite's email is found by the id it was queued under (its stored copy hides the code); an old one's stored
    // copy still shows its code.
    const emails = inv.email
      ? (await db.run("DELETE FROM outbox WHERE lower(to_email) = lower(?) AND (id = ? OR strpos(body, ?) > 0)", inv.email, inv.outbox_id ?? -1, inv.code)).changes
      : 0;
    await db.run("DELETE FROM invites WHERE code = ? AND revoked_at IS NOT NULL", inv.code);
    return { ok: true, code: inv.code, label, email: inv.email, emails };
  });
}
