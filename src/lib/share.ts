import "server-only";
import crypto from "node:crypto";
import { logEvent, now, q, type Track, type User } from "./db";

export type Share = { id: number; track_id: number; token: string; created_at: number; expires_at: number; revoked_at: number | null; plays: number; downloads: number };

const DAY = 86_400_000;
/** Listen-only links for colleagues last a week; the receiver can switch one off sooner. */
export const SHARE_DAYS = 7;

/** A track can be shared only if its collection allowed sharing when it was sent, and it's still on the desk. */
export const canShare = (t: Pick<Track, "share_ok" | "deleted_at" | "file_key">) => !!t.share_ok && !t.deleted_at && !!t.file_key;

export async function activeShare(trackId: number) {
  return q.get<Share>("SELECT * FROM track_shares WHERE track_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1", trackId, now());
}

/** Creates (or reuses) a private listen-only link for a colleague. The sender sees it on their receipt. */
export async function createShare(user: User, t: Track) {
  if (!canShare(t) || t.user_id !== user.id) return null;
  const existing = await activeShare(t.id);
  if (existing) return existing;
  const share = (await q.get<Share>(
    "INSERT INTO track_shares (track_id, token, created_at, expires_at) VALUES (?,?,?,?) RETURNING *",
    t.id,
    crypto.randomBytes(18).toString("base64url"),
    now(),
    now() + SHARE_DAYS * DAY,
  ))!;
  await logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: "shared", detail: "" });
  return share;
}

export async function revokeShares(user: User, t: Track) {
  if (t.user_id !== user.id) return;
  await q.run("UPDATE track_shares SET revoked_at = ? WHERE track_id = ? AND revoked_at IS NULL", now(), t.id);
}

/** The public side: the share, its track and the receiver's name, only while the link is live. */
export async function shareByToken(token: string) {
  return q.get<Share & { title: string; artist: string; peaks: string | null; duration: number | null; mime: string; file_key: string | null; receiver: string; receiver_plan: string; deleted_at: number | null; original_name: string; artist_title: string }>(
    `SELECT s.*, t.title, t.artist, t.peaks, t.duration, t.mime, t.file_key, t.deleted_at, t.original_name, t.artist || ' - ' || t.title AS artist_title, u.name AS receiver, u.plan AS receiver_plan
     FROM track_shares s JOIN tracks t ON t.id = s.track_id JOIN users u ON u.id = t.user_id
     WHERE s.token = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND t.share_ok = 1 AND t.deleted_at IS NULL`,
    token,
    now(),
  );
}
