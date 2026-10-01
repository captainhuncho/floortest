import "server-only";
import crypto from "node:crypto";
import { logEvent, now, q, type Track, type User } from "./db";
import { APP_URL, sendMail } from "./mail";
import { shareDownloadEnabled, SHARING_LIVE } from "./plans";

export type Share = { id: number; track_id: number; token: string; created_at: number; expires_at: number; revoked_at: number | null; plays: number; downloads: number };

const DAY = 86_400_000;
/** Listen-only links for colleagues last a week; the receiver can switch one off sooner. */
export const SHARE_DAYS = 7;

/** A track can be shared only if its collection allowed sharing when it was sent, and it's still on the desk. */
export const canShare = (t: Pick<Track, "share_ok" | "deleted_at" | "file_key">) => SHARING_LIVE && !!t.share_ok && !t.deleted_at && !!t.file_key;

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

/** Who opened a share link, by FloorTest account. Colleagues must be signed in to listen or download. */
export async function logShareAccess(shareId: number, userId: number, kind: "play" | "download") {
  await q.run("INSERT INTO share_access (share_id, user_id, kind, created_at) VALUES (?,?,?,?)", shareId, userId, kind, now());
}

export async function shareAudience(trackId: number) {
  return q.all<{ name: string; handle: string; plays: number; downloads: number }>(
    `SELECT u.name, u.handle, COUNT(CASE WHEN a.kind = 'play' THEN 1 END) AS plays, COUNT(CASE WHEN a.kind = 'download' THEN 1 END) AS downloads
     FROM share_access a JOIN track_shares s ON s.id = a.share_id JOIN users u ON u.id = a.user_id
     WHERE s.track_id = ? GROUP BY u.id, u.name, u.handle ORDER BY MAX(a.created_at) DESC`,
    trackId,
  );
}

export async function revokeShares(user: User, t: Track) {
  if (t.user_id !== user.id) return;
  await q.run("UPDATE track_shares SET revoked_at = ? WHERE track_id = ? AND revoked_at IS NULL", now(), t.id);
}

/** The public side: the share, its track and the receiver's name, only while the link is live. */
export async function shareByToken(token: string) {
  if (!SHARING_LIVE) return undefined;
  return q.get<Share & { title: string; artist: string; peaks: string | null; duration: number | null; mime: string; file_key: string | null; receiver: string; receiver_id: number; receiver_plan: string; share_download: number; deleted_at: number | null; original_name: string; artist_title: string }>(
    `SELECT s.*, t.title, t.artist, t.peaks, t.duration, t.mime, t.file_key, t.deleted_at, t.original_name, t.artist || ' - ' || t.title AS artist_title, u.name AS receiver, u.id AS receiver_id, u.plan AS receiver_plan, t.share_download
     FROM track_shares s JOIN tracks t ON t.id = s.track_id JOIN users u ON u.id = t.user_id
     WHERE s.token = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND t.share_ok = 1 AND t.deleted_at IS NULL`,
    token,
    now(),
  );
}

/* ── Asking the artist: per-track permission to share with a non-commercial partner ── */

export type ShareRequest = { id: number; track_id: number; note: string; downloads: number; status: "pending" | "allowed" | "declined"; created_at: number; decided_at: number | null };

export async function latestShareRequest(trackId: number) {
  return q.get<ShareRequest>("SELECT * FROM share_requests WHERE track_id = ? ORDER BY created_at DESC LIMIT 1", trackId);
}

/**
 * The receiver asks the artist to allow sharing one track with a non-commercial partner, for playing and
 * promotion only. Whether the partner may also download is fixed now, by the receiver's plan, and told to the artist.
 * Placeholder wording until the lawyer's draft (docs/legal-review.md).
 */
export async function requestShareConsent(user: User, t: Track, note: string) {
  if (!SHARING_LIVE || t.user_id !== user.id || t.deleted_at || t.share_ok) return null;
  const open = await latestShareRequest(t.id);
  if (open?.status === "pending") return open;
  const downloads = shareDownloadEnabled(user.plan) ? 1 : 0;
  const req = (await q.get<ShareRequest>(
    "INSERT INTO share_requests (track_id, note, downloads, created_at) VALUES (?,?,?,?) RETURNING *",
    t.id,
    note.trim().slice(0, 280),
    downloads,
    now(),
  ))!;
  const s = await q.get<{ email: string; name: string }>("SELECT email, name FROM senders WHERE id = ?", t.sender_id);
  if (s)
    await sendMail({
      userId: user.id,
      audience: "sender",
      to: s.email,
      subject: `${user.name} would like to share "${t.title}"`,
      body: [
        `Hi ${s.name.split(/\s+/)[0]},`,
        "",
        `${user.name} would like to share "${t.title}" with someone they work with, so they can play it in their sets and help promote it.`,
        req.note ? `\n"${req.note}"\n` : "",
        `They would ${downloads ? "be able to listen and download" : "only be able to listen"}, through a private FloorTest link that expires after 7 days. It's never for commercial release without a signed agreement with you.`,
        "",
        `Allow or decline here: ${APP_URL}/t/${t.token}`,
        "",
        "Nothing changes unless you say yes.",
      ].join("\n"),
    });
  return req;
}

/** The artist's answer, from their private receipt page. Allowing makes the track shareable. */
export async function answerShareRequest(trackToken: string, requestId: number, allow: boolean) {
  if (!SHARING_LIVE) return false;
  const t = await q.get<Track>("SELECT * FROM tracks WHERE token = ?", trackToken);
  const req = t && (await q.get<ShareRequest>("SELECT * FROM share_requests WHERE id = ? AND track_id = ? AND status = 'pending'", requestId, t.id));
  if (!t || !req || t.deleted_at) return false;
  await q.run("UPDATE share_requests SET status = ?, decided_at = ? WHERE id = ?", allow ? "allowed" : "declined", now(), req.id);
  if (allow) await q.run("UPDATE tracks SET share_ok = 1, share_download = ? WHERE id = ?", req.downloads, t.id);
  const r = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", t.user_id);
  if (r)
    await sendMail({
      userId: t.user_id,
      audience: "receiver",
      to: r.email,
      subject: allow ? `You can share "${t.title}"` : `"${t.title}" stays with you`,
      body: allow
        ? `The artist said yes. You can now create a private share link for "${t.title}" from the track: ${APP_URL}/dashboard?view=queue&s=all&t=${t.id}`
        : `The artist would rather "${t.title}" isn't shared for now. It stays on your desk as before.`,
    });
  return true;
}
