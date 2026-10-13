import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { isProtectedHandle } from "./identity";
import { APP_URL, sendMail } from "./mail";
import { RESERVED_HANDLES } from "./plans";

const DAY = 86_400_000;
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";
/** How long an old link keeps forwarding, and stays reserved for its owner. Then anyone can claim it. */
export const HANDLE_HOLD_DAYS = 14;
/** A link name can change once in this many days. */
export const HANDLE_CHANGE_DAYS = 365;

/** When this account may next change its link name, or null if it can now. */
export async function nextHandleChange(userId: number) {
  const r = await q.get<{ handle_changed_at: number | null }>("SELECT handle_changed_at FROM users WHERE id = ?", userId);
  const at = r?.handle_changed_at ? r.handle_changed_at + HANDLE_CHANGE_DAYS * DAY : 0;
  return at > now() ? at : null;
}
/** How long the confirmation link for a new email works. */
export const EMAIL_CHANGE_HOURS = 48;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mask = (e: string) => e.replace(/^(.{2}).*@/, "$1…@");

/** How long a deleted account's link names stay reserved: links printed on flyers and in bios outlive a rename's. */
export const DELETED_HANDLE_HOLD_DAYS = 365;

/**
 * An old handle someone else gave up recently, or one a deleted account used: reserved, so nobody can grab a link
 * that's still in bios.
 */
export async function handleHeld(handle: string, forUserId = 0) {
  const t = now();
  return !!(
    (await q.get("SELECT 1 FROM handle_history WHERE old_handle = ? AND expires_at > ? AND user_id <> ?", handle, t, forUserId)) ||
    (await q.get("SELECT 1 FROM released_handles WHERE handle = ? AND expires_at > ?", handle, t))
  );
}

/** Where an old link points now, if it still forwards. */
export async function forwardedHandle(old: string) {
  return (
    await q.get<{ handle: string }>(
      "SELECT u.handle FROM handle_history h JOIN users u ON u.id = h.user_id WHERE h.old_handle = ? AND h.forward = 1 AND h.expires_at > ? AND u.suspended_at IS NULL",
      old.toLowerCase(),
      now(),
    )
  )?.handle;
}

/**
 * The Verified mark vouches for the name, link and profiles FloorTest checked. Changing any of them takes it away until
 * it's checked again (the owner sees why under Profile and can send it again). True if it was verified.
 */
export async function resetVerified(db: Pick<typeof q, "run">, userId: number) {
  const r = await db.run(
    "UPDATE users SET identity_status = 'rejected', identity_verified_at = NULL, identity_note = ? WHERE id = ? AND identity_status = 'verified'",
    "your page name, link or profiles changed after it was checked, so it needs checking again",
    userId,
  );
  return r.changes > 0;
}

/**
 * Moves an account to a new handle. The old one forwards for HANDLE_HOLD_DAYS and is reserved for them,
 * unless `forward` is off (taken back for impersonation): then it's released at once.
 * `checks` off skips the protected-name rule and the once-a-year limit, for admins.
 * Going back to your own old name while it's still held is an undo: it doesn't use up the yearly change.
 */
export async function changeHandle(userId: number, next: string, { forward = true, checks = true } = {}): Promise<string | null> {
  const handle = next.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(handle)) return "Link names use 2–30 letters, numbers, - or _.";
  if (RESERVED_HANDLES.has(handle)) return "That link name is reserved.";
  const u = await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", userId);
  if (!u) return "Account not found.";
  if (u.handle === handle) return null;
  if (checks && (await isProtectedHandle(handle))) return "That name is protected for a well-known artist. If it's you, contact us.";
  if (await handleHeld(handle, userId)) return "That link was someone's until recently and is still reserved.";
  // Switching back keeps the original deadline, so bouncing between names can't hold two of them forever.
  const undo = await q.get<{ expires_at: number }>("SELECT expires_at FROM handle_history WHERE old_handle = ? AND user_id = ? AND expires_at > ?", handle, userId, now());
  if (checks && !undo) {
    const next = await nextHandleChange(userId);
    if (next) return `You can change your link once a year. Next change: ${new Date(next).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`;
  }
  try {
    await q.tx(async (db) => {
      await db.run("DELETE FROM handle_history WHERE old_handle = ?", handle); // taking back one of your own old links
      await db.run("UPDATE users SET handle = ? WHERE id = ?", handle, userId);
      await resetVerified(db, userId);
      if (!undo) await db.run("UPDATE users SET handle_changed_at = ? WHERE id = ?", now(), userId);
      if (forward)
        await db.run(
          "INSERT INTO handle_history (old_handle, user_id, forward, created_at, expires_at) VALUES (?,?,?,?,?) ON CONFLICT (old_handle) DO UPDATE SET user_id = excluded.user_id, forward = 1, created_at = excluded.created_at, expires_at = excluded.expires_at",
          u.handle, userId, 1, now(), undo ? undo.expires_at : now() + HANDLE_HOLD_DAYS * DAY,
        );
      else await db.run("DELETE FROM handle_history WHERE old_handle = ?", u.handle);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return "That link is taken.";
    throw e;
  }
  return null;
}

/**
 * Starts an email change: nothing changes until the new address clicks the link we send it.
 * The current address is told, so the real owner notices a change they didn't ask for.
 */
export async function requestEmailChange(userId: number, next: string, by: "user" | "admin"): Promise<string | null> {
  const email = next.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return "Enter a valid email address.";
  const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", userId);
  if (!u) return "Account not found.";
  if (u.email === email) return "That's already the email on this account.";
  if (await q.get("SELECT 1 FROM users WHERE lower(email) = ?", email)) return "Another account already uses that email.";
  const token = crypto.randomBytes(24).toString("base64url");
  await q.run("UPDATE users SET pending_email = ?, pending_email_token = ?, pending_email_at = ? WHERE id = ?", email, token, now(), userId);
  const first = u.name.split(/\s+/)[0];
  await sendMail({
    userId,
    audience: "support",
    to: email,
    secrets: [token],
    subject: "Confirm your new email for FloorTest",
    body: `Hi ${first},\n\nConfirm this address to make it the email for your FloorTest account (sign-in, password resets and alerts):\n${APP_URL}/confirm-email/${token}\n\nThe link works for ${EMAIL_CHANGE_HOURS} hours. If you didn't ask for this, ignore it and nothing changes.\n\n— FloorTest`,
  });
  await sendMail({
    userId,
    audience: "support",
    to: u.email,
    subject: "Your FloorTest email is being changed",
    body: `Hi ${first},\n\n${by === "admin" ? "At your request, our support team started" : "Someone signed in to your account started"} changing its email to ${mask(email)}. It only changes once that address confirms.\n\nIf this wasn't you, reply to this email or contact us straight away: ${APP_URL}/contact\n\n— FloorTest`,
  });
  return null;
}

/**
 * Counts only for the person signed in to that account. Anyone can create an account with someone else's email, and the
 * link goes to the real owner: if their click alone confirmed it, whoever made the account (and still holds its password
 * and session) would get a confirmed identity in their name. The real owner who didn't make it can take it over with an
 * email code instead, which resets the creator's password, two-factor and sessions.
 */
export async function confirmEmail(token: string, personId: number | null) {
  if (!token || token.length > 100 || !personId) return undefined;
  return q.get<{ id: number }>(
    "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), email_verify_token = NULL WHERE email_verify_token = ? AND id = ? RETURNING id",
    now(),
    token,
    personId,
  );
}

export async function pendingEmailFor(token: string) {
  if (!token || token.length > 100) return undefined;
  return q.get<{ id: number; email: string; pending_email: string; pending_email_at: number }>(
    "SELECT id, email, pending_email, pending_email_at FROM users WHERE pending_email_token = ? AND pending_email_at > ?",
    token,
    now() - EMAIL_CHANGE_HOURS * 3_600_000,
  );
}

/**
 * The click from the new address, by the person signed in to that account. Swaps the email, marks it confirmed, and
 * signs out other devices. Signed-in only: otherwise someone could request a change to a stranger's address, wait for
 * them to click, and keep a confirmed account in their name with a password the stranger never set.
 */
export async function confirmEmailChange(token: string, personId: number | null) {
  const p = await pendingEmailFor(token);
  if (!p || !personId || p.id !== personId) return null;
  try {
    const r = await q.run(
      "UPDATE users SET email = pending_email, email_verified_at = ?, email_verify_token = NULL, pending_email = NULL, pending_email_token = NULL, pending_email_at = NULL WHERE id = ? AND pending_email_token = ?",
      now(), p.id, token,
    );
    if (!r.changes) return null;
  } catch (e) {
    if (isUniqueViolation(e)) return null; // someone else took that address in the meantime
    throw e;
  }
  await q.run("DELETE FROM sessions WHERE user_id = ?", p.id);
  return { id: p.id, from: p.email, to: p.pending_email };
}

export async function cancelEmailChange(userId: number) {
  await q.run("UPDATE users SET pending_email = NULL, pending_email_token = NULL, pending_email_at = NULL WHERE id = ?", userId);
}
