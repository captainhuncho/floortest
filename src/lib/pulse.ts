import "server-only";
import { q } from "./db";

/**
 * A short "version" of what someone's open pages show. It changes whenever something they'd see changes, so a
 * page can ask cheaply and only re-render when it differs. Each part is one indexed lookup.
 */
export async function deskPulse(userId: number) {
  const r = await q.get<{ e: number; v: number; s: number; a: number }>(
    `SELECT
       (SELECT COALESCE(MAX(id), 0) FROM events WHERE user_id = ?) AS e,
       (SELECT COALESCE(MAX(c.id), 0) FROM track_comments c JOIN tracks t ON t.id = c.track_id WHERE t.user_id = ?) AS v,
       (SELECT COALESCE(MAX(s.created_at), 0) FROM track_shortlist s JOIN tracks t ON t.id = s.track_id WHERE t.user_id = ?) AS s,
       (SELECT COALESCE(MAX(announcement_id), 0) FROM announcement_recipients WHERE user_id = ?) AS a`,
    userId, userId, userId, userId,
  );
  return r ? `${r.e}.${r.v}.${r.s}.${r.a}` : "0";
}

/** What a sender's private receipt shows: the track's steps. */
export async function receiptPulse(token: string) {
  const r = await q.get<{ p: string }>(
    `SELECT CONCAT_WS('.', t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, t.deleted_at, t.share_ok) AS p
     FROM tracks t WHERE t.token = ?`,
    token,
  );
  return r?.p ?? "";
}
