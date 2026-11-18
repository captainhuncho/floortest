import "server-only";
import { asPerson, q } from "./db";

/**
 * Covers for Collections (owner, 17 Nov: option 57 I, "four covers"). Each callout shows the music: its own artwork
 * first, then its newest tracks that have artwork, at most four. The tile draws four as a 2x2 square and anything less
 * as the first one, full size. Picked here in two queries for the whole desk, never one request per callout.
 *
 * Track artwork is linked through /api/track-art/<id>, which asks fileAccess("art") on every request, so a person who
 * can't see a track can't fetch its artwork either. Projects (library_tracks) carry no artwork yet, so they get none.
 */
export const MAX_COVERS = 4;

export const collectionArtUrl = (id: number, key: string) => `/api/collection-art/${id}?v=${encodeURIComponent(key)}`;
export const trackArtUrl = (id: number, key: string) => `/api/track-art/${id}?v=${encodeURIComponent(key)}`;

type Desk = { id: number; actor_id: number };
export type OwnArt = { id: number; art_key: string };
export type TrackArt = { collection_id: number; id: number; art_key: string };

/** A callout's covers, in order: its own artwork, then its tracks' (newest first, as given), never more than four. */
export function pickCovers(own: string | null, tracks: string[]): string[] {
  return [...(own ? [own] : []), ...tracks].slice(0, MAX_COVERS);
}

/** Every callout's covers on this desk, by callout id. Callouts with no artwork at all are left out. */
export function coversByCallout(own: OwnArt[], tracks: TrackArt[]): Map<number, string[]> {
  const byCallout = new Map<number, string[]>();
  for (const t of tracks) {
    const id = Number(t.collection_id);
    byCallout.set(id, [...(byCallout.get(id) ?? []), trackArtUrl(Number(t.id), t.art_key)]);
  }
  const ownById = new Map(own.map((c) => [Number(c.id), collectionArtUrl(Number(c.id), c.art_key)]));
  const ids = new Set([...ownById.keys(), ...byCallout.keys()]);
  return new Map([...ids].map((id) => [id, pickCovers(ownById.get(id) ?? null, byCallout.get(id) ?? [])]));
}

/** The desk's callout covers, read as the signed-in person (row-level security shows only desks they may work). */
export async function calloutCovers(desk: Desk): Promise<Map<number, string[]>> {
  const [own, tracks] = await asPerson(desk.actor_id, () =>
    Promise.all([
      q.all<OwnArt>("SELECT id, art_key FROM collections WHERE user_id = ? AND art_key IS NOT NULL", desk.id),
      q.all<TrackArt>(
        `SELECT collection_id, id, art_key FROM (
           SELECT t.collection_id, t.id, t.art_key, ROW_NUMBER() OVER (PARTITION BY t.collection_id ORDER BY t.created_at DESC, t.id DESC) AS n
           FROM tracks t WHERE t.user_id = ? AND t.collection_id IS NOT NULL AND t.deleted_at IS NULL AND t.art_key IS NOT NULL
         ) x WHERE n <= ${MAX_COVERS} ORDER BY collection_id, n`,
        desk.id,
      ),
    ]),
  );
  return coversByCallout(own, tracks);
}
