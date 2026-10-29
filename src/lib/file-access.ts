import "server-only";
import { asPerson, q, type Track } from "@/lib/db";
import { featureOn } from "@/lib/features";
import { IMAGE_TYPES, type ImageKind } from "@/lib/images";
import { quarantined, withoutHeld } from "@/lib/file-digests";
import { stemsFor, type Stem } from "@/lib/stems";

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
 *   stems     all of a track's stems, same rule; the grant lists the ones that may be served (held ones left out)
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
  /** For `stems`: the stems to put in the ZIP, each one past the same fingerprint hold as a single file. */
  stems?: Stem[];
};

/**
 * Storage links can't be withdrawn once handed out, so they are short (Codex review, phase A item 4): 5 minutes, after
 * which the player asks this check again for a fresh one. Signing out, being removed from a team, a suspension or a
 * deleted track therefore cuts off playback within 5 minutes, not an hour. Downloads, stems and share-page audio
 * stream through the app and are checked on every request.
 */
const PLAY_LINK_SECONDS = 300;
const OFFLINE_LINK_SECONDS = 300;

export async function fileAccess(
  desk: { id: number; plan: string; actor_id?: number } | null | undefined,
  action: FileAction,
  trackId: number,
  stemId?: number,
): Promise<FileGrant | null> {
  const grant = await grantFor(desk, action, trackId, stemId);
  // A file that failed its fingerprint check (changed or gone, src/lib/file-digests.ts) is held back until ops looks.
  return grant?.key && (await quarantined(grant.key)) ? null : grant;
}

async function grantFor(
  desk: { id: number; plan: string; actor_id?: number } | null | undefined,
  action: FileAction,
  trackId: number,
  stemId?: number,
): Promise<FileGrant | null> {
  if (!desk || !Number.isSafeInteger(trackId) || trackId <= 0) return null;
  const find = () => q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, desk.id);
  // A signed-in person's request is also checked by the per-person database rules (migration 0097, `asPerson`).
  const track = desk.actor_id ? await asPerson(desk.actor_id, find) : await find();
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
    case "stems": {
      if (!(await featureOn("stems", desk))) return null;
      // Many files, so no single key for the hold in fileAccess: each stem is checked here instead.
      const stems = await withoutHeld(await stemsFor(track.id), (s) => s.file_key);
      return stems.length ? { track, key: "", mime: "application/zip", maxLinkSeconds: PLAY_LINK_SECONDS, stems } : null;
    }
    default:
      return null;
  }
}
