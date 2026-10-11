import "server-only";
import { currentPerson } from "./auth";
import { linkSessionSecret } from "./link-cookies";
import { linkByKey, linkSession, linkTrack } from "./share-links";

/** For audio and downloads through a share link (its address, or `a.<id>` for account holders on the list): the live link, a valid session for it, and one of its tracks. Re-checked on every request. */
export async function gatedTrack(key: string, trackId: number) {
  const viewer = await currentPerson();
  const link = await linkByKey(key, viewer);
  if (!link) return undefined;
  const session = await linkSession(link, await linkSessionSecret(link.id), viewer?.id ?? null);
  if (!session) return undefined;
  const track = await linkTrack(link, trackId);
  return track?.file_key ? { link, session, track } : undefined;
}
