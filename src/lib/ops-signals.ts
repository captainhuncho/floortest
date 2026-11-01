import "server-only";
import { q } from "@/lib/db";
import { JOBS } from "@/lib/cron";

/**
 * Ops → Moderation's queue (ops redesign B, owner 1 Nov): only tracks with a real signal, not every track. Three signals:
 *   takedown        an open takedown claim on the track
 *   blocked_sender  a sender some receiver has blocked: their newest track, with how many receivers blocked them
 *   late_scan       an upload held for its virus check longer than the scan job's own late mark (not a track yet)
 * A track leaves the queue once a staff member keeps it (Moderation → Keep, tracks.ops_reviewed_at) after the signal; a
 * new claim or block after that brings it back. A late scan leaves when the scan delivers or refuses it. Each signal is
 * read with named columns and its own LIMIT, then all are sorted newest first and capped.
 */
export const SIGNAL_LIMIT = 50;
/** As Jobs counts the virus check late (src/lib/cron.ts JOBS.scan). */
export const LATE_SCAN_MS = JOBS.scan.lateAfterMs;

export type SignalKind = "takedown" | "blocked_sender" | "late_scan";

export type Signal = {
  kind: SignalKind;
  /** The signal's own id: the takedown's, the blocked sender's email, or the held upload's. */
  id: string;
  /** The track to look at; null for a held upload, which isn't a track yet. */
  track_id: number | null;
  title: string;
  subtitle: string;
  signal_at: number;
  href: string;
  /** The receiver's handle: whose desk the track is on (or the held upload was sent to). */
  handle: string;
  /** Who the signal names: the claimant, the blocked sender's email, or the held upload's sender email. */
  who: string;
  /** How many receivers blocked the sender (1 for the other signals). */
  count: number;
};

type TrackRow = { signal: string | number; track_id: number; title: string; artist: string; handle: string; detail: string; signal_at: number };

const toSignal = (kind: SignalKind, r: TrackRow, subtitle: string, count = 1): Signal => ({
  kind,
  id: String(r.signal),
  track_id: Number(r.track_id),
  title: `${r.artist} – ${r.title}`,
  subtitle,
  signal_at: Number(r.signal_at),
  href: `/admin/moderation?t=${r.track_id}`,
  handle: r.handle,
  who: r.detail,
  count,
});

async function takedowns(): Promise<Signal[]> {
  const rows = await q.all<TrackRow>(
    `SELECT tk.id AS signal, t.id AS track_id, t.title, t.artist, u.handle, tk.claimant AS detail, tk.created_at AS signal_at
       FROM takedowns tk JOIN tracks t ON t.id = tk.track_id JOIN users u ON u.id = t.user_id
      WHERE tk.status = 'open' AND t.deleted_at IS NULL AND (t.ops_reviewed_at IS NULL OR t.ops_reviewed_at < tk.created_at)
      ORDER BY tk.created_at DESC LIMIT ${SIGNAL_LIMIT}`,
  );
  return rows.map((r) => toSignal("takedown", r, `Takedown claim by ${r.detail} · on @${r.handle}`));
}

async function blockedSenders(): Promise<Signal[]> {
  // The blocked emails first (the senders_blocked index), then each one's newest track still up anywhere.
  const rows = await q.all<TrackRow & { blocks: number }>(
    `WITH b AS (
       SELECT lower(email) AS email, MAX(blocked_at) AS at, COUNT(*) AS blocks FROM senders WHERE blocked_at IS NOT NULL
        GROUP BY lower(email) ORDER BY MAX(blocked_at) DESC LIMIT ${SIGNAL_LIMIT}
     ), newest AS (
       SELECT DISTINCT ON (b.email) b.email, b.at, b.blocks, t.id AS track_id, t.title, t.artist, t.ops_reviewed_at, u.handle
         FROM b JOIN senders s ON lower(s.email) = b.email JOIN tracks t ON t.sender_id = s.id AND t.deleted_at IS NULL JOIN users u ON u.id = t.user_id
        ORDER BY b.email, t.created_at DESC
     )
     SELECT email AS signal, track_id, title, artist, handle, email AS detail, at AS signal_at, blocks FROM newest
      WHERE ops_reviewed_at IS NULL OR ops_reviewed_at < at ORDER BY at DESC`,
  );
  return rows.map((r) => toSignal("blocked_sender", r, `${r.detail} blocked by ${r.blocks} receiver${Number(r.blocks) === 1 ? "" : "s"} · newest to @${r.handle}`, Number(r.blocks)));
}

async function lateScans(at: number): Promise<Signal[]> {
  const rows = await q.all<{ id: string; meta: string; held_at: number; handle: string }>(
    `SELECT up.id, up.meta, up.held_at, u.handle FROM uploads up JOIN users u ON u.id = up.receiver_id
      WHERE up.held_at IS NOT NULL AND up.held_at < ? ORDER BY up.held_at DESC LIMIT ${SIGNAL_LIMIT}`,
    at - LATE_SCAN_MS,
  );
  return rows.map((r) => {
    let meta: { title?: string; email?: string } = {};
    try {
      meta = JSON.parse(r.meta);
    } catch {}
    return {
      kind: "late_scan" as const,
      id: r.id,
      track_id: null,
      title: meta.title || "An upload",
      subtitle: `Waiting for its virus check · from ${meta.email || "a sender"} to @${r.handle}`,
      signal_at: Number(r.held_at),
      href: "/admin/jobs",
      handle: r.handle,
      who: meta.email || "a sender",
      count: 1,
    };
  });
}

/** The queue (newest first, capped) and how many of each signal were read. Callers check the moderation permission. */
export async function moderationSignals(at = Date.now()): Promise<{ signals: Signal[]; counts: Record<SignalKind, number> }> {
  const [t, b, l] = await Promise.all([takedowns(), blockedSenders(), lateScans(at)]);
  const signals = [...t, ...b, ...l].sort((x, y) => y.signal_at - x.signal_at).slice(0, SIGNAL_LIMIT);
  return { signals, counts: { takedown: t.length, blocked_sender: b.length, late_scan: l.length } };
}
