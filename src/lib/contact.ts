/** One contact's history on a desk (the contact page): counts over everything, the latest tracks and messages only. */
import "server-only";
import { q, type Track } from "./db";

/** Tracks shown at first, and how many more each "Show more" adds; the most a link can ask for. */
export const TRACK_PAGE = 50;
export const MAX_TRACKS = 1000;
/** The conversation shows this person's latest messages, replies and notes. */
export const MAX_MESSAGES = 200;

export type ContactMessage =
  | { kind: "message"; at: number; text: string; track: string; trackId: number }
  | { kind: "reply" | "note"; at: number; text: string; track: string | null; trackId: number | null };
export type ContactTrack = Pick<Track, "id" | "title" | "duration" | "decision" | "played_at" | "downloaded_at" | "deleted_at" | "created_at"> & {
  collection_name: string | null;
};

/** How many tracks a "?n=" asks to see, rounded up to whole pages and kept within the limits. */
export const tracksShown = (n: unknown) => Math.min(MAX_TRACKS, Math.max(TRACK_PAGE, Math.ceil((Number(n) || TRACK_PAGE) / TRACK_PAGE) * TRACK_PAGE));

/**
 * The sender must already be checked as this desk's (ownedSender). The numbers count every track they sent, the list is
 * the newest `shown`, and the conversation the newest MAX_MESSAGES (oldest first), with `olderMessages` when there are more.
 */
export async function contactHistory(senderId: number, shown: number) {
  const [stats, tracks, latest] = await Promise.all([
    q.get<{ sent: number; kept: number; downloaded: number; first_at: number | null; last_at: number | null }>(
      `SELECT COUNT(*)::int AS sent, (COUNT(*) FILTER (WHERE decision = 'kept'))::int AS kept,
         (COUNT(*) FILTER (WHERE downloaded_at IS NOT NULL))::int AS downloaded, MIN(created_at) AS first_at, MAX(created_at) AS last_at
       FROM tracks WHERE sender_id = ?`,
      senderId,
    ),
    q.all<ContactTrack>(
      `SELECT t.id, t.title, t.duration, t.decision, t.played_at, t.downloaded_at, t.deleted_at, t.created_at, c.name AS collection_name
         FROM tracks t LEFT JOIN collections c ON c.id = t.collection_id WHERE t.sender_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
      senderId,
      shown,
    ),
    q.all<{ kind: ContactMessage["kind"]; at: number; text: string; track: string | null; track_id: number | null }>(
      `SELECT * FROM (
         SELECT 'message' AS kind, t.created_at AS at, t.message AS text, t.title AS track, t.id AS track_id FROM tracks t
           WHERE t.sender_id = ? AND t.message != ''
         UNION ALL
         SELECT e.type, e.created_at, e.detail, t.title, e.track_id FROM events e LEFT JOIN tracks t ON t.id = e.track_id
           WHERE e.sender_id = ? AND e.type IN ('reply', 'note')
       ) m ORDER BY at DESC LIMIT ?`,
      senderId,
      senderId,
      MAX_MESSAGES + 1,
    ),
  ]);
  const thread = latest
    .slice(0, MAX_MESSAGES)
    .reverse()
    .map((m) => ({ kind: m.kind, at: Number(m.at), text: m.text, track: m.track, trackId: m.track_id }) as ContactMessage);
  return {
    sent: stats!.sent,
    kept: stats!.kept,
    downloaded: stats!.downloaded,
    firstSent: stats!.first_at === null ? undefined : Number(stats!.first_at),
    lastSent: stats!.last_at === null ? undefined : Number(stats!.last_at),
    tracks,
    thread,
    olderMessages: latest.length > MAX_MESSAGES,
  };
}
