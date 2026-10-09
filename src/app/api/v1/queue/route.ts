import { appUser } from "@/lib/app-auth";
import { json, unauthorized } from "@/lib/api-v1";
import { q } from "@/lib/db";

export const runtime = "nodejs";

/** Tracks waiting for a decision, oldest first (the Review Queue). Audio plays from /api/v1/tracks/:id/audio. */
export async function GET(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const rows = await q.all<{ id: number; title: string; artist: string; genre: string; bpm: number | null; duration: number | null; sets_ok: number; created_at: number; sender: string; collection: string | null }>(
    `SELECT t.id, t.title, t.artist, t.genre, t.bpm, t.duration, t.sets_ok, t.created_at, s.name AS sender, c.name AS collection
     FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL AND t.file_key IS NOT NULL
     ORDER BY t.created_at LIMIT 200`,
    u.id,
  );
  return json({ tracks: rows.map((r) => ({ ...r, setsOk: !!r.sets_ok, sets_ok: undefined, audio: `/api/v1/tracks/${r.id}/audio` })) });
}
