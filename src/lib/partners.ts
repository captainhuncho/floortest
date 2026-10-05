import "server-only";
import { q } from "./db";
import { env } from "./env";

const DAY = 86_400_000;
/** Signed up this long ago with no track yet: they probably haven't shared their link. */
export const NO_TRACK_DAYS = 7;
/** No visit for this long: gone quiet. */
export const QUIET_DAYS = 10;
/** Personal invite sent this long ago and not used. */
export const NOT_JOINED_DAYS = 5;

export type PartnerRow = {
  email: string;
  name: string | null;
  userId: number | null;
  handle: string | null;
  plan: string | null;
  invitedAt: number | null;
  joinedAt: number | null;
  confirmedAt: number | null;
  firstTrackAt: number | null;
  tracks: number;
  reviewed: number;
  lastDecisionAt: number | null;
  lastActiveAt: number | null;
  feedback: number;
  note: string;
  stage: "Invited" | "Joined" | "Receiving" | "Reviewing";
  flag: string | null;
};

/**
 * Every beta account (admins excluded) plus personal invites not used yet, with how far each person has got.
 * Small by design: the beta is a few dozen people, so one pass is fine.
 */
export async function partnerRows(at = Date.now()): Promise<PartnerRow[]> {
  const admins = env.adminEmails.map((e) => e.toLowerCase());
  const users = await q.all<{
    id: number; email: string; name: string; handle: string; plan: string; created_at: number; email_verified_at: number | null; last_active_at: number | null;
    invited_at: number | null; first_track: number | null; tracks: number; reviewed: number; last_decision: number | null; feedback: number;
  }>(
    `SELECT u.id, u.email, u.name, u.handle, u.plan, u.created_at, u.email_verified_at, u.last_active_at,
            (SELECT COALESCE(i.sent_at, i.created_at) FROM invites i WHERE i.code = u.invite_code) AS invited_at,
            (SELECT MIN(t.created_at) FROM tracks t WHERE t.user_id = u.id) AS first_track,
            (SELECT COUNT(*)::int FROM tracks t WHERE t.user_id = u.id) AS tracks,
            (SELECT COUNT(*)::int FROM tracks t WHERE t.user_id = u.id AND t.decision IS NOT NULL) AS reviewed,
            (SELECT MAX(t.decided_at) FROM tracks t WHERE t.user_id = u.id) AS last_decision,
            (SELECT COUNT(*)::int FROM contact_messages m WHERE m.user_id = u.id AND m.topic LIKE 'Feedback%') AS feedback
     FROM users u WHERE u.suspended_at IS NULL ORDER BY u.created_at DESC`,
  );
  const pending = await q.all<{ email: string; at: number }>(
    `SELECT lower(i.email) AS email, COALESCE(i.sent_at, i.created_at) AS at FROM invites i
     WHERE i.email IS NOT NULL AND i.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email))`,
  );
  const notes = new Map((await q.all<{ email: string; note: string }>("SELECT email, note FROM partner_notes")).map((n) => [n.email, n.note]));

  const rows: PartnerRow[] = [];
  for (const u of users) {
    const email = u.email.toLowerCase();
    if (admins.includes(email)) continue;
    const stage = u.reviewed > 0 ? "Reviewing" : u.tracks > 0 ? "Receiving" : "Joined";
    const lastSeen = u.last_active_at ?? u.created_at;
    const flag =
      u.tracks === 0 && at - u.created_at > NO_TRACK_DAYS * DAY
        ? `No track ${Math.floor((at - u.created_at) / DAY)} days after joining`
        : at - lastSeen > QUIET_DAYS * DAY
          ? `Quiet for ${Math.floor((at - lastSeen) / DAY)} days`
          : null;
    rows.push({
      email, name: u.name, userId: u.id, handle: u.handle, plan: u.plan, invitedAt: u.invited_at, joinedAt: u.created_at, confirmedAt: u.email_verified_at,
      firstTrackAt: u.first_track, tracks: u.tracks, reviewed: u.reviewed, lastDecisionAt: u.last_decision, lastActiveAt: u.last_active_at,
      feedback: u.feedback, note: notes.get(email) ?? "", stage, flag,
    });
  }
  for (const p of pending) {
    if (admins.includes(p.email) || rows.some((r) => r.email === p.email)) continue;
    rows.push({
      email: p.email, name: null, userId: null, handle: null, plan: null, invitedAt: p.at, joinedAt: null, confirmedAt: null, firstTrackAt: null,
      tracks: 0, reviewed: 0, lastDecisionAt: null, lastActiveAt: null, feedback: 0, note: notes.get(p.email) ?? "", stage: "Invited",
      flag: at - p.at > NOT_JOINED_DAYS * DAY ? `Invited ${Math.floor((at - p.at) / DAY)} days ago, not joined` : null,
    });
  }
  return rows;
}
