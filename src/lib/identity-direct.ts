import "server-only";
import { likeContains, now, q } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { logAdmin } from "./admin-log";
import { emailText, VERIFIED_HOW } from "./email-copy";

/** The "verified" email (Admin → Site content → Emails), with the line for how the mark was added. */
export const verifiedEmail = (u: { name: string; handle: string }, how: keyof typeof VERIFIED_HOW) =>
  emailText("verified", { first_name: u.name.split(/\s+/)[0], link: `${env.appUrl}/${u.handle}`, how_line: VERIFIED_HOW[how] });

/**
 * Verifying someone without a request (owner, 1 Nov): staff who already know who an account belongs to (a known label,
 * a DJ they've checked) add the Verified mark straight away, with a short note on how they checked. The note is kept
 * on the account and in the admin log. The email says the team checked them instead of mentioning a code, because they never asked.
 */

export const DIRECT_NOTE_MIN = 2;
export const DIRECT_NOTE_MAX = 200;
export const DIRECT_SEARCH_MAX = 10;

type Result = { ok: true; handle: string } | { ok: false; why: string };

export async function verifyDirect(adminId: number, userId: number, rawNote: string): Promise<Result> {
  const note = rawNote.trim().replace(/\s+/g, " ");
  if (note.length < DIRECT_NOTE_MIN) return { ok: false, why: "Say how you checked it's them, e.g. known label, checked their Instagram" };
  if (note.length > DIRECT_NOTE_MAX) return { ok: false, why: `Keep the note under ${DIRECT_NOTE_MAX} characters` };
  const u = await q.get<{ identity_status: string; suspended_at: number | null; email_verified_at: number | null }>(
    "SELECT identity_status, suspended_at, email_verified_at FROM users WHERE id = ?",
    userId,
  );
  if (!u) return { ok: false, why: "Account not found" };
  if (u.identity_status === "verified") return { ok: false, why: "That account is already verified" };
  if (u.suspended_at) return { ok: false, why: "That account is suspended: restore it before verifying" };
  if (!u.email_verified_at) return { ok: false, why: "They haven't confirmed their email yet, so it can't be verified" };
  // The WHERE repeats the checks, so two staff clicking at once (or a change in between) verify once and email once.
  const row = await q.get<{ email: string; name: string; handle: string }>(
    `UPDATE users SET identity_status = 'verified', identity_verified_at = ?, identity_note = ?
     WHERE id = ? AND identity_status <> 'verified' AND suspended_at IS NULL AND email_verified_at IS NOT NULL
     RETURNING email, name, handle`,
    now(),
    note,
    userId,
  );
  if (!row) return { ok: false, why: "That account is already verified" };
  await sendMail({ userId, audience: "receiver", to: row.email, ...(await verifiedEmail(row, "direct")) });
  await logAdmin(adminId, "verified identity (no request)", `@${row.handle}`, note);
  return { ok: true, handle: row.handle };
}

export type DirectMatch = { id: number; name: string; handle: string; email: string; identity_status: string; suspended_at: number | null; email_verified_at: number | null };

/** Verification → "Verify someone directly": accounts whose handle or email contains the search, at most 10. */
export async function findToVerify(raw: string): Promise<DirectMatch[]> {
  const term = raw.trim().replace(/^@/, "").slice(0, 100);
  if (term.length < 2) return [];
  const like = likeContains(term);
  return q.all<DirectMatch>(
    `SELECT id, name, handle, email, identity_status, suspended_at, email_verified_at FROM users
     WHERE handle ILIKE ? OR email ILIKE ?
     ORDER BY (lower(handle) = lower(?)) DESC, created_at DESC LIMIT ${DIRECT_SEARCH_MAX}`,
    like,
    like,
    term,
  );
}
