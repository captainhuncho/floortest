import "server-only";
import { q } from "./db";

/**
 * A cover the owner chooses for one of their projects or folders (owner, 19 Nov: "Change cover" in the ··· menu). Stored
 * like a callout's artwork (src/app/api/collection-art): a WebP under folder-art/, reserved before it's written (kind
 * "folder_art", src/lib/file-reservations.ts), served only to the desk it belongs to, and deleted with its project or
 * folder, its replacement, or the account.
 */
export type ArtKind = "project" | "folder";
const TABLE: Record<ArtKind, string> = { project: "library_folders", folder: "desk_folders" };

export const isArtKind = (k: unknown): k is ArtKind => k === "project" || k === "folder";

/** The URL a tile shows; ?v= carries the key, so a new cover is a new URL and the old one can be cached hard. */
export const folderArtUrl = (kind: ArtKind, id: number, key: string) => `/api/folder-art/${kind}/${id}?v=${encodeURIComponent(key)}`;

export type ArtRow = { id: number; user_id: number; name: string; art_key: string | null };

/** The project or folder with its cover, whoever's it is (callers check the desk). */
export async function artRow(kind: ArtKind, id: number): Promise<ArtRow | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return (await q.get<ArtRow>(`SELECT id, user_id, name, art_key FROM ${TABLE[kind]} WHERE id = ?`, id)) ?? null;
}

/** Points the project or folder at a new cover (or none), only on its own desk. The cover it had, for deleting; undefined when the row is gone. */
export async function setArt(kind: ArtKind, id: number, deskId: number, key: string | null): Promise<string | null | undefined> {
  return q.tx(async (db) => {
    const row = await db.get<{ art_key: string | null }>(`SELECT art_key FROM ${TABLE[kind]} WHERE id = ? AND user_id = ? FOR UPDATE`, id, deskId);
    if (!row) return undefined;
    await db.run(`UPDATE ${TABLE[kind]} SET art_key = ? WHERE id = ? AND user_id = ?`, key, id, deskId);
    return row.art_key;
  });
}
