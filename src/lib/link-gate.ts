import "server-only";
import { linkSessionSecret } from "./link-cookies";
import { linkBySecret, linkSession, linkTrack } from "./share-links";

/** For audio and downloads through a share link: the live link, a valid session for it, and one of its tracks. Re-checked on every request. */
export async function gatedTrack(secret: string, trackId: number) {
  const link = await linkBySecret(secret);
  if (!link) return undefined;
  const session = await linkSession(link, await linkSessionSecret(link.id));
  if (!session) return undefined;
  const track = await linkTrack(link, trackId);
  return track?.file_key ? { link, session, track } : undefined;
}
