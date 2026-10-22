import "server-only";
import { q, type Track } from "@/lib/db";
import { featureOn } from "@/lib/features";
import { IMAGE_TYPES, type ImageKind } from "@/lib/images";

/**
 * Who may fetch which private file, decided in one place (Codex review, 19 Oct). Every receiver file route asks here:
 * playback, download, the phone app, stems, artwork and offline copies. Deny by default: anything not listed gets null.
 *
 * `desk` is the account the request works on, already resolved by its sign-in (currentUser(), appUser() or an offline
 * link's live checks), so team membership and suspension have been checked before this runs. Identifiers from the
 * request (track, stem) are only ever looked up on that desk.
 *
 *   play      the track's audio, on the desk, not deleted
 *   download  the same; the route also refuses requests started on another site
 *   offline   the audio of a track still kept and in Prepare
 *   stem      one stem of a track on the desk, with stems switched on for the desk
 *   stems     all of a track's stems, same rule
 *   art       the track's artwork
 */
export type FileAction = "play" | "download" | "offline" | "stem" | "stems" | "art";

export type FileGrant = {
  track: Track;
  key: string;
  mime: string;
  /** Longest a storage link handed out for this file may last. */
  maxLinkSeconds: number;
  name?: string;
};

const PLAY_LINK_SECONDS = 3600;
const OFFLINE_LINK_SECONDS = 300;

export async function fileAccess(
  desk: { id: number; plan: string } | null | undefined,
  action: FileAction,
  trackId: number,
  stemId?: number,
): Promise<FileGrant | null> {
  if (!desk || !Number.isSafeInteger(trackId) || trackId <= 0) return null;
  const track = await q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, desk.id);
  if (!track) return null;
  switch (action) {
    case "play":
    case "download":
      return track.file_key ? { track, key: track.file_key, mime: track.mime, maxLinkSeconds: PLAY_LINK_SECONDS } : null;
    case "offline":
      if (!track.file_key || track.decision !== "kept" || track.set_cleared_at != null) return null;
      return { track, key: track.file_key, mime: track.mime, maxLinkSeconds: OFFLINE_LINK_SECONDS };
    case "art": {
      if (!track.art_key) return null;
      const mime = IMAGE_TYPES[track.art_key.split(".").pop() as ImageKind] ?? "application/octet-stream";
      return { track, key: track.art_key, mime, maxLinkSeconds: PLAY_LINK_SECONDS };
    }
    case "stem": {
      if (!Number.isSafeInteger(stemId) || !(await featureOn("stems", desk))) return null;
      const stem = await q.get<{ file_key: string; mime: string; name: string }>("SELECT file_key, mime, name FROM stems WHERE id = ? AND track_id = ?", stemId, track.id);
      return stem ? { track, key: stem.file_key, mime: stem.mime, name: stem.name, maxLinkSeconds: PLAY_LINK_SECONDS } : null;
    }
    case "stems":
      return (await featureOn("stems", desk)) ? { track, key: "", mime: "application/zip", maxLinkSeconds: PLAY_LINK_SECONDS } : null;
    default:
      return null;
  }
}
