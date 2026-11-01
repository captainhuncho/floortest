import "server-only";
import { likeContains, q } from "@/lib/db";
import { fmtBytes, fmtTime } from "@/lib/format";
import type { Signal } from "@/lib/ops-signals";
import { staffMayPlay } from "@/lib/staff-listen";
import { signalsNow } from "../../shell/data";
import { ageWords, signalWords, type QueueRow } from "./model";

/** The picked track, everything the middle pane and the decision need. Dates are worded here, on the server. */
export type TrackDetail = {
  track_id: number;
  title: string;
  artist: string;
  receiver: string;
  receiverName: string;
  user_id: number;
  sender_id: number;
  sender: string;
  email: string;
  /** Already blocked on this receiver's link. */
  blockedHere: boolean;
  length: string;
  size: string;
  received: string;
  peaks: number[] | null;
  duration: number | null;
  playable: boolean;
  reviewed: string | null;
  history: { tracks: number; receivers: number; blocked: number };
  events: { at: string; type: string; detail: string }[];
};

type TrackInfo = { id: number; title: string; artist: string; token: string; handle: string; sender: string; email: string; ops_reviewed_at: number | null; reviewed_by: string | null };
const INFO = `SELECT t.id, t.title, t.artist, t.token, u.handle, s.name AS sender, s.email, t.ops_reviewed_at, r.handle AS reviewed_by
  FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id LEFT JOIN users r ON r.id = t.ops_reviewed_by`;
const SEARCH_LIMIT = 100;

const when = (ms: number, year = false) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" });

function rowFrom(s: Signal | null, t: TrackInfo | undefined, at: number, now: number): QueueRow {
  const kind = s?.kind ?? null;
  const handle = t?.handle ?? s?.handle ?? "";
  const words = signalWords({ kind, who: s?.who ?? "", count: s?.count ?? 1, handle });
  const [artist, title] = t ? [t.artist, t.title] : s?.track_id ? s.title.split(" – ", 2) : ["", s?.title ?? ""];
  return {
    key: s ? `${s.kind}:${s.id}` : `track:${t?.id}`,
    kind,
    track_id: s ? s.track_id : (t?.id ?? null),
    title: title ?? s?.title ?? "",
    artist: artist ?? "",
    receiver: handle,
    sender: t?.sender ?? (kind === "late_scan" ? s!.who : ""),
    email: t?.email ?? (kind === "late_scan" ? s!.who : ""),
    token: t?.token ?? "",
    age: ageWords(now - at),
    ...words,
    reviewedBy: t?.ops_reviewed_at ? `@${t.reviewed_by ?? "a former team member"}` : null,
  };
}

/**
 * The queue's rows: every signal (newest first, capped by ops-signals), each with its track's title, artist, receiver
 * and sender for the row and the search. With a search, today's search instead (title, artist, sender name or email,
 * or a receipt token, across every account), each found track carrying its signal when it has one.
 */
export async function queueRows(search: string, now = Date.now()): Promise<QueueRow[]> {
  const { signals } = await signalsNow();
  if (!search) {
    const ids = [...new Set(signals.flatMap((s) => (s.track_id ? [s.track_id] : [])))];
    const info = ids.length ? await q.all<TrackInfo>(`${INFO} WHERE t.id = ANY(?)`, ids) : [];
    const byId = new Map(info.map((t) => [Number(t.id), t]));
    return signals.map((s) => rowFrom(s, s.track_id ? byId.get(s.track_id) : undefined, s.signal_at, now));
  }
  const like = likeContains(search);
  const found = await q.all<TrackInfo & { created_at: number }>(
    `${INFO.replace("SELECT ", "SELECT t.created_at, ")}
     WHERE t.deleted_at IS NULL AND (t.title ILIKE ? OR t.artist ILIKE ? OR s.email ILIKE ? OR s.name ILIKE ? OR t.token = ?)
     ORDER BY t.created_at DESC LIMIT ${SEARCH_LIMIT}`,
    like, like, like, like, search,
  );
  const signalOf = new Map<number, Signal>();
  for (const s of signals) if (s.track_id && !signalOf.has(s.track_id)) signalOf.set(s.track_id, s);
  return found.map((t) => {
    const s = signalOf.get(Number(t.id)) ?? null;
    return rowFrom(s, t, s?.signal_at ?? Number(t.created_at), now);
  });
}

/** The picked track for the middle pane, as today's Detail reads it, or null when it is gone. */
export async function trackDetail(id: number): Promise<TrackDetail | null> {
  const t = await q.get<{
    id: number; title: string; artist: string; size: number; duration: number | null; peaks: string | null; created_at: number; handle: string; receiver_name: string; user_id: number;
    sender_id: number; sender: string; email: string; blocked_at: number | null; ops_reviewed_at: number | null; reviewed_by: string | null;
  }>(
    `SELECT t.id, t.title, t.artist, t.size, t.duration, t.peaks, t.created_at, u.handle, u.name AS receiver_name, u.id AS user_id, s.id AS sender_id, s.name AS sender, s.email, s.blocked_at,
            t.ops_reviewed_at, r.handle AS reviewed_by
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id LEFT JOIN users r ON r.id = t.ops_reviewed_by
      WHERE t.id = ? AND t.deleted_at IS NULL`,
    id,
  );
  if (!t) return null;
  const [history, events, playable] = await Promise.all([
    q.get<{ tracks: number; receivers: number; blocked: number }>(
      `SELECT COUNT(t.id) AS tracks, COUNT(DISTINCT s.user_id) AS receivers, COUNT(DISTINCT s.id) FILTER (WHERE s.blocked_at IS NOT NULL) AS blocked
       FROM senders s LEFT JOIN tracks t ON t.sender_id = s.id AND t.deleted_at IS NULL WHERE lower(s.email) = lower(?)`,
      t.email,
    ),
    q.all<{ type: string; detail: string; created_at: number }>("SELECT type, detail, created_at FROM events WHERE track_id = ? ORDER BY created_at DESC LIMIT 5", t.id),
    staffMayPlay(t.id),
  ]);
  let peaks: number[] | null = null;
  try {
    peaks = t.peaks ? (JSON.parse(t.peaks) as number[]) : null;
  } catch {}
  return {
    track_id: Number(t.id),
    title: t.title,
    artist: t.artist,
    receiver: t.handle,
    receiverName: t.receiver_name,
    user_id: Number(t.user_id),
    sender_id: Number(t.sender_id),
    sender: t.sender,
    email: t.email,
    blockedHere: !!t.blocked_at,
    length: t.duration ? fmtTime(Number(t.duration)) : "–:––",
    size: fmtBytes(Number(t.size)),
    received: when(Number(t.created_at), true),
    peaks,
    duration: t.duration == null ? null : Number(t.duration),
    playable,
    reviewed: t.ops_reviewed_at ? `Kept by @${t.reviewed_by ?? "a former team member"}, ${when(Number(t.ops_reviewed_at))}` : null,
    history: { tracks: Number(history?.tracks ?? 0), receivers: Number(history?.receivers ?? 0), blocked: Number(history?.blocked ?? 0) },
    events: events.map((e) => ({ at: when(Number(e.created_at)), type: e.type, detail: e.detail })),
  };
}
