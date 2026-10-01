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
export async function createShare(user: User, t0: Track) {
  await finalizeConsent(t0.id);
  const t = (await q.get<Track>("SELECT * FROM tracks WHERE id = ?", t0.id)) ?? t0;
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

export type ShareRequest = { id: number; track_id: number; note: string; downloads: number; status: "pending" | "allowed" | "declined" | "cancelled"; created_at: number; decided_at: number | null };

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

/** After the artist allows sharing, they have this long to cancel. After that the consent is final. */
export const CONSENT_CANCEL_MINUTES = 2;
const CANCEL_MS = CONSENT_CANCEL_MINUTES * 60_000;

export const consentFinalAt = (r: Pick<ShareRequest, "decided_at">) => (r.decided_at ?? 0) + CANCEL_MS;

/**
 * Makes a track shareable once an Allow has outlived its cancel window. Called wherever sharing is checked,
 * so no background job is needed.
 */
export async function finalizeConsent(trackId: number) {
  if (!SHARING_LIVE) return;
  const r = await q.get<ShareRequest>(
    "SELECT * FROM share_requests WHERE track_id = ? AND status = 'allowed' AND decided_at <= ? ORDER BY decided_at DESC LIMIT 1",
    trackId,
    now() - CANCEL_MS,
  );
  if (!r) return;
  // Claim the flip so the receiver is alerted exactly once, however many places call this.
  const t = await q.get<Track>("UPDATE tracks SET share_ok = 1, share_download = ? WHERE id = ? AND share_ok = 0 RETURNING *", r.downloads, trackId);
  if (!t) return;
  const u = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", t.user_id);
  if (u)
    await sendMail({
      userId: t.user_id,
      audience: "receiver",
      to: u.email,
      subject: `You can share "${t.title}"`,
      body: `The artist's consent is now final. You can create a private share link for "${t.title}" from the track, for playing in sets and promotion only: ${APP_URL}/dashboard?view=queue&s=all&t=${t.id}`,
    });
}

/** Every receiver's Allows whose window has passed. A backstop for when the post-Allow wait didn't run. */
export async function finalizeDueConsents(userId: number) {
  if (!SHARING_LIVE) return;
  const due = await q.all<{ track_id: number }>(
    `SELECT DISTINCT r.track_id FROM share_requests r JOIN tracks t ON t.id = r.track_id
     WHERE t.user_id = ? AND t.share_ok = 0 AND r.status = 'allowed' AND r.decided_at <= ?`,
    userId,
    now() - CANCEL_MS,
  );
  for (const d of due) await finalizeConsent(d.track_id);
}

/** The artist's answer, from their private receipt page. Allowing starts the cancel window; sharing begins after it. */
export async function answerShareRequest(trackToken: string, requestId: number, allow: boolean) {
  if (!SHARING_LIVE) return false;
  const t = await q.get<Track>("SELECT * FROM tracks WHERE token = ?", trackToken);
  const req = t && (await q.get<ShareRequest>("SELECT * FROM share_requests WHERE id = ? AND track_id = ? AND status = 'pending'", requestId, t.id));
  if (!t || !req || t.deleted_at) return false;
  await q.run("UPDATE share_requests SET status = ?, decided_at = ? WHERE id = ?", allow ? "allowed" : "declined", now(), req.id);
  const when = `${CONSENT_CANCEL_MINUTES} minutes`;
  const artist = await q.get<{ email: string; name: string }>("SELECT email, name FROM senders WHERE id = ?", t.sender_id);
  if (allow && artist)
    await sendMail({
      userId: t.user_id,
      audience: "sender",
      to: artist.email,
      subject: `You allowed sharing "${t.title}"`,
      body: `Thanks. If you change your mind, you have ${when} to cancel on your receipt: ${APP_URL}/t/${t.token}\n\nAfter that it's final and can't be withdrawn. Sharing is only for playing in sets and promotion, never commercial release without a signed agreement with you.`,
    });
  // The receiver hears about an Allow only once it's final (finalizeConsent), never during the cancel window.
  const r = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", t.user_id);
  if (r && !allow)
    await sendMail({
      userId: t.user_id,
      audience: "receiver",
      to: r.email,
      subject: `"${t.title}" stays with you`,
      body: `The artist would rather "${t.title}" isn't shared for now. It stays on your desk as before.`,
    });
  return true;
}

/** Within the cancel window only. After it, an Allow is final. */
export async function cancelShareConsent(trackToken: string, requestId: number) {
  if (!SHARING_LIVE) return false;
  const t = await q.get<Track>("SELECT * FROM tracks WHERE token = ?", trackToken);
  const req = t && (await q.get<ShareRequest>("SELECT * FROM share_requests WHERE id = ? AND track_id = ? AND status = 'allowed'", requestId, t.id));
  if (!t || !req || now() >= consentFinalAt(req)) return false;
  await q.run("UPDATE share_requests SET status = 'cancelled' WHERE id = ?", req.id);
  // The receiver was never told about the Allow, so a cancel needs no email; their request simply shows as cancelled.
  return true;
}
