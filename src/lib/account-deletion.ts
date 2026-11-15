import "server-only";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";
import { hashToken } from "./token-hash";
import { revokeAllSessions } from "./sessions";
import { audit } from "./audit";
import { logAdmin } from "./admin-log";
import { purgeAccount } from "./privacy";
import { recordIncident } from "./incidents";
import { APP_URL, sendMail } from "./mail";

/**
 * Deleted accounts (owner, 15 Nov). Deleting switches the account off at once: deletion_requested_at is set and the
 * same time goes into suspended_at, so every check that shuts out a suspended account (sign-in, sessions, the desk,
 * the link page, collection links, team access, the app) shuts this one out too. For 14 days the owner can undo it
 * by signing in fully (password and two-step, an email code, a passkey or Google); that sign-in leads only to /restore.
 * On day 14 the nightly job keeps a minimal evidence record (6 years) and purges the account. A super admin's legal
 * hold stops the purge and the evidence expiry; releasing it restarts the clock.
 */
export const UNDO_DAYS = 14;
export const EVIDENCE_YEARS = 6;
const DAY = 86_400_000;
export const UNDO_MS = UNDO_DAYS * DAY;
export const RESTORE_COOKIE = "floortest_restore";
/** How long the restore page stays open after the sign-in that leads to it. */
export const RESTORE_TICKET_MS = 15 * 60_000;
/** Accounts purged per nightly run, so one night can't run past the job's time limit; the rest go the next night. */
const PURGE_BATCH = 25;

/**
 * Switched off by a deletion (not by an admin's suspension) and still inside the 14 days. An admin suspension sets its
 * own time, so suspended_at only equals deletion_requested_at when the deletion is the reason.
 */
const RESTORABLE = "deletion_requested_at IS NOT NULL AND suspended_at = deletion_requested_at AND deletion_requested_at > ?";

export async function restorable(userId: number, db: Queryable = q) {
  return !!(await db.get(`SELECT 1 FROM users WHERE id = ? AND ${RESTORABLE}`, userId, now() - UNDO_MS));
}

/** For sign-in by email: the account if it may sign in normally or to restore, else nothing. */
export async function signInAccountByEmail(email: string) {
  return q.get<{ id: number; name: string }>(`SELECT id, name FROM users WHERE email = ? AND (suspended_at IS NULL OR (${RESTORABLE}))`, email, now() - UNDO_MS);
}

const purgeDate = (requestedAt: number) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(requestedAt + UNDO_MS);

/**
 * Switches the account off and starts the 14 days: every session (web, app, ops) ends now and nothing it held can be
 * used. Already pending: nothing changes and the first date stands. Returns the time the deletion was asked for.
 */
export async function requestDeletion(userId: number, by: { adminId: number } | null = null) {
  const t = now();
  const row = await q.tx(async (db) => {
    const r = await db.get<{ email: string; name: string; handle: string; requested: number }>(
      `UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, ?), suspended_at = COALESCE(suspended_at, ?)
       WHERE id = ? RETURNING email, name, handle, deletion_requested_at AS requested`,
      t,
      t,
      userId,
    );
    if (!r) return undefined;
    await revokeAllSessions(userId, { db });
    await db.run("DELETE FROM restore_tickets WHERE user_id = ?", userId);
    return r;
  });
  if (!row) return null;
  const requested = Number(row.requested);
  await audit(userId, "deletion_requested", by ? "by FloorTest staff" : "");
  if (by) await logAdmin(by.adminId, "deleted account (privacy request)", `@${row.handle}`, row.email.replace(/^(.{2}).*@/, "$1…@"));
  await sendMail({
    userId: null,
    audience: "support",
    to: row.email,
    reserved: true,
    subject: "Your FloorTest account is switched off and will be deleted",
    body: [
      `Hi ${row.name.split(/\s+/)[0]},`,
      "",
      `Your FloorTest account (${row.handle}) is switched off${by ? ", as you asked us" : ", as you asked from Settings"}. Your link, desk and collections are offline, and senders can't send to you.`,
      "",
      `Everything on it will be deleted on ${purgeDate(requested)}. To keep your account, sign in before then and choose Restore my account: ${APP_URL}/login`,
      "",
      "If this wasn't you, sign in and restore your account, then change your password.",
      "",
      "— FloorTest",
    ].join("\n"),
    // The account is already off: a mail failure must not show the person an error (Safety, 15 Nov).
  }).catch((e) => console.error("[deletions] switched-off email failed", userId, e));
  return requested;
}

/** After a full sign-in to a switched-off account: a one-time ticket for the restore page (the cookie holds it). */
export async function issueRestoreTicket(userId: number) {
  const id = crypto.randomBytes(32).toString("base64url");
  await q.run("INSERT INTO restore_tickets (id_hash, user_id, expires_at) VALUES (?,?,?)", hashToken(id), userId, now() + RESTORE_TICKET_MS);
  return id;
}

/** Whose restore a ticket is for, if it is live and the account can still be restored. Doesn't use it up. */
export async function restoreTicketUser(id: string | undefined) {
  if (!id || id.length > 100) return null;
  const row = await q.get<{ user_id: number }>("SELECT user_id FROM restore_tickets WHERE id_hash = ? AND expires_at > ?", hashToken(id), now());
  if (!row || !(await restorable(Number(row.user_id)))) return null;
  return Number(row.user_id);
}

/** For the restore page: when the deletion was asked for and when the account goes. */
export async function deletionStatus(userId: number) {
  const r = await q.get<{ requested: number | null }>("SELECT deletion_requested_at AS requested FROM users WHERE id = ?", userId);
  if (!r?.requested) return { state: "active" as const, requestedAt: null, purgeAt: null };
  return { state: "pending" as const, requestedAt: Number(r.requested), purgeAt: Number(r.requested) + UNDO_MS };
}

/** Uses the ticket and switches the account back on. The caller then signs the person in. Null when it can't. */
export async function restoreWithTicket(id: string | undefined) {
  if (!id || id.length > 100) return null;
  const userId = await q.tx(async (db) => {
    const t = await db.get<{ user_id: number }>("DELETE FROM restore_tickets WHERE id_hash = ? AND expires_at > ? RETURNING user_id", hashToken(id), now());
    if (!t) return null;
    const back = await db.run(
      `UPDATE users SET suspended_at = NULL, deletion_requested_at = NULL WHERE id = ? AND ${RESTORABLE}`,
      Number(t.user_id),
      now() - UNDO_MS,
    );
    if (!back.changes) return null;
    await db.run("DELETE FROM restore_tickets WHERE user_id = ?", Number(t.user_id));
    // An evidence row written before a purge that didn't happen is stale once the account is back (Safety, 15 Nov).
    await db.run("DELETE FROM account_evidence WHERE user_id = ?", Number(t.user_id));
    return Number(t.user_id);
  });
  if (userId) await audit(userId, "account_restored");
  return userId;
}

/**
 * The evidence kept 6 years after the purge (owner, 15 Nov): who the account was, its sign-ins and other account log
 * lines, admin actions on it, and what senders submitted and what was played or downloaded (sender email, track title,
 * time). Terms acceptances are kept by their own table. No audio, file keys, passwords, tokens or messages.
 */
/** account_log actions whose detail goes into the evidence record (no third-party names or free text in them). */
const EVIDENCE_DETAIL = ["signed_in", "signed_out", "password_reset", "password_changed", "two_factor_on", "two_factor_off", "plan_changed", "deletion_requested", "account_restored"];

async function keepEvidence(db: Queryable, userId: number, t: number) {
  const u = await db.get<{ name: string; email: string; handle: string; created_at: number; requested: number }>(
    "SELECT name, email, handle, created_at, deletion_requested_at AS requested FROM users WHERE id = ?",
    userId,
  );
  if (!u) return;
  // Every row's action and time; the detail only where it is about how they used the account (sign-in method, plan),
  // never free text that can name other people (team invites, sender names, link messages).
  const accountLog = await db.all(
    "SELECT action, CASE WHEN action IN (" + EVIDENCE_DETAIL.map(() => "?").join(",") + ") THEN detail ELSE '' END AS detail, created_at FROM account_log WHERE user_id = ? ORDER BY created_at",
    ...EVIDENCE_DETAIL,
    userId,
  );
  // A staff reason is free text: any email address in it is taken out.
  const accountActions = (await db.all<{ kind: string; reason: string; created_at: number }>("SELECT kind, reason, created_at FROM account_actions WHERE user_id = ? ORDER BY created_at", userId)).map(
    (a) => ({ ...a, reason: String(a.reason ?? "").replace(/[^\s@]+@[^\s@]+/g, "(email removed)") }),
  );
  const events = await db.all(
    `SELECT e.type, s.email AS sender_email, t.title AS track_title, e.created_at FROM events e
     JOIN senders s ON s.id = e.sender_id LEFT JOIN tracks t ON t.id = e.track_id
     WHERE e.user_id = ? AND e.type IN ('submitted', 'played', 'downloaded') ORDER BY e.created_at`,
    userId,
  );
  // On a retry after a failed purge the first record stands (one per account).
  await db.run(
    `INSERT INTO account_evidence (user_id, name, email, handle, account_created_at, deletion_requested_at, purged_at, keep_from, record)
     VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (user_id) DO NOTHING`,
    userId,
    u.name,
    u.email,
    u.handle,
    u.created_at,
    u.requested ?? t,
    t,
    t,
    JSON.stringify({ accountLog, accountActions, events }),
  );
}

/**
 * Nightly (lib/cron-jobs.ts purge): accounts past their 14 days, not on legal hold, get their evidence record and are
 * purged. Each account is its own try, so one failure doesn't stop the rest; a failed one is retried the next night
 * (the evidence insert keeps the first record) and raised as an incident. Then evidence past 6 years goes, unless held.
 */
/**
 * Due for purge: deletion asked more than 14 days ago, still switched off (an admin who switched it back on cancels
 * the purge), and not on legal hold. One placeholder: the cut-off time.
 */
const DUE = "deletion_requested_at IS NOT NULL AND deletion_requested_at <= ? AND suspended_at IS NOT NULL AND legal_hold_at IS NULL";

export async function runDeletions(t = now()) {
  const due = await q.all<{ id: number; email: string; name: string; handle: string }>(
    `SELECT id, email, name, handle FROM users WHERE ${DUE} ORDER BY deletion_requested_at LIMIT ?`,
    t - UNDO_MS,
    PURGE_BATCH,
  );
  let purged = 0;
  let failed = 0;
  for (const u of due) {
    try {
      // Checked again just before: a hold or an admin's change since the list was read wins (Safety H1).
      if (!(await q.get(`SELECT 1 AS ok FROM users WHERE id = ? AND ${DUE}`, u.id, t - UNDO_MS))) continue;
      await keepEvidence(q, Number(u.id), t);
      // Checked once more inside the purge's own transaction, with the row locked: a hold set in between wins.
      if (!(await purgeAccount(Number(u.id), async (db) => !!(await db.get(`SELECT 1 AS ok FROM users WHERE id = ? AND ${DUE}`, u.id, t - UNDO_MS))))) continue;
      purged++;
    } catch (e) {
      failed++;
      console.error("[deletions] purge failed", u.id, e);
      continue;
    }
    // After the purge, so a failed email can't stop it and no email says "deleted" before it is.
    await sendMail({
      userId: null,
      audience: "support",
      to: u.email,
      reserved: true,
      subject: "Your FloorTest account was deleted",
      body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest account (${u.handle}) and everything on it were deleted today, 14 days after you asked.\n\n— FloorTest`,
    }).catch((e) => console.error("[deletions] deleted email failed", u.id, e));
  }
  await q.run("DELETE FROM restore_tickets WHERE expires_at < ?", t);
  if (failed) await recordIncident("cron_failed", `${failed} deleted account(s) couldn't be purged`, "Retried next night. Their evidence record is kept.", "/api/cron/purge");
  const expired = await q.run("DELETE FROM account_evidence WHERE legal_hold_at IS NULL AND keep_from < ?", yearsBefore(t, EVIDENCE_YEARS));
  return { accountsPurged: purged, accountPurgesFailed: failed, evidenceExpired: expired.changes };
}

function yearsBefore(t: number, years: number) {
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

/**
 * Legal hold (super admin only; the caller checks). On a live or switched-off account it stops the purge; on a purged
 * account's evidence it stops the expiry. It does not pause the ordinary retention rules (tracks still expire on their
 * schedule, the person can still delete their own tracks): it holds the account and its evidence record only. Returns
 * false when there is nothing to hold, or when an admin names their own account.
 */
export async function setLegalHold(adminId: number, userId: number, reason: string) {
  const why = reason.trim().slice(0, 500);
  // No reason, or an admin holding their own account (so it can't be used to dodge their own deletion): refused.
  if (!why || adminId === userId) return false;
  const t = now();
  // The first hold stands: a second one doesn't overwrite its date or reason.
  const onAccount = await q.get("SELECT 1 AS ok FROM users WHERE id = ?", userId);
  const kept = await q.run(
    onAccount
      ? "UPDATE users SET legal_hold_at = ?, legal_hold_reason = ? WHERE id = ? AND legal_hold_at IS NULL"
      : "UPDATE account_evidence SET legal_hold_at = ?, legal_hold_reason = ? WHERE user_id = ? AND legal_hold_at IS NULL",
    t,
    why,
    userId,
  );
  if (!kept.changes) return false;
  await logAdmin(adminId, "set legal hold", `account #${userId}`, why);
  return true;
}

/** Ends a hold. The clock restarts: a switched-off account gets 14 days from now, evidence 6 years from now. */
export async function clearLegalHold(adminId: number, userId: number) {
  if (adminId === userId) return false;
  const t = now();
  const live = await q.run(
    `UPDATE users SET legal_hold_at = NULL, legal_hold_reason = '',
       suspended_at = CASE WHEN deletion_requested_at IS NOT NULL AND suspended_at = deletion_requested_at THEN ?::bigint ELSE suspended_at END,
       deletion_requested_at = CASE WHEN deletion_requested_at IS NOT NULL THEN ?::bigint ELSE NULL END
     WHERE id = ? AND legal_hold_at IS NOT NULL`,
    t,
    t,
    userId,
  );
  // A live account's old evidence row (from a purge a hold stopped) is rewritten at its real purge (Safety, 15 Nov).
  if (live.changes) await q.run("DELETE FROM account_evidence WHERE user_id = ?", userId);
  const done = live.changes
    ? live
    : await q.run("UPDATE account_evidence SET legal_hold_at = NULL, legal_hold_reason = '', keep_from = ? WHERE user_id = ? AND legal_hold_at IS NOT NULL", t, userId);
  if (!done.changes) return false;
  await logAdmin(adminId, "cleared legal hold", `account #${userId}`);
  return true;
}
