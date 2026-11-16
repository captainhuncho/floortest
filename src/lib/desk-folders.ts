import "server-only";
import { asPerson, now, q, type User } from "./db";
import { coverUrl } from "./cover-url";
import { discardFiles } from "./deletion";
import { IntakeError } from "./intake";

/**
 * Folders to organise a desk's callouts and projects (owner, 16 Nov, in the Desk). A callout folder holds only
 * callouts, a project folder only projects; one level, private to the desk. The database enforces both (composite
 * foreign keys on folder, desk and kind, migration 0151), so these helpers only shape the answers. Everything runs as
 * the signed-in person (asPerson): row-level security shows only desks they may work.
 */
export type FolderKind = "callout" | "project";
/** Up to four of what's in a folder, newest first, for its tile (art: the callout's or project's cover URL, or null). */
export type FolderPreview = { id: number; name: string; art: string | null };
export type DeskFolder = { id: number; kind: FolderKind; name: string; count: number; created_at: number; art: string | null; preview: FolderPreview[] };

type Desk = Pick<User, "id" | "actor_id">;
// No cap on folders (owner, 16 Nov, in the Desk: "don't limit people folders"); the plan's track allowance is the limit.

export const isFolderKind = (k: unknown): k is FolderKind => k === "callout" || k === "project";
const ITEMS: Record<FolderKind, string> = { callout: "collections", project: "library_folders" };

const folderName = (raw: string) => {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) throw new IntakeError("Give the folder a name.", 400);
  return name;
};

/** The desk's folders of one kind, oldest first, each with how many callouts or projects are in it. */
export async function listDeskFolders(desk: Desk, kind: FolderKind): Promise<DeskFolder[]> {
  const rows = await asPerson(desk.actor_id, () =>
    q.all<DeskFolder>(
      `SELECT f.id, f.kind, f.name, f.created_at, f.art_key, (SELECT COUNT(*) FROM ${ITEMS[kind]} i WHERE i.desk_folder_id = f.id AND i.user_id = f.user_id) AS count
       FROM desk_folders f WHERE f.user_id = ? AND f.kind = ? ORDER BY f.created_at, f.id`,
      desk.id,
      kind,
    ),
  );
  const items = await asPerson(desk.actor_id, () =>
    q.all<{ id: number; name: string; art_key: string | null; desk_folder_id: number }>(
      `SELECT id, name, art_key, desk_folder_id FROM (
         SELECT i.id, i.name, i.art_key, i.desk_folder_id, ROW_NUMBER() OVER (PARTITION BY i.desk_folder_id ORDER BY i.created_at DESC, i.id DESC) AS n
         FROM ${ITEMS[kind]} i WHERE i.user_id = ? AND i.desk_folder_id IS NOT NULL
       ) x WHERE n <= 4 ORDER BY desk_folder_id, n`,
      desk.id,
    ),
  );
  const preview = new Map<number, FolderPreview[]>();
  for (const i of items) {
    const list = preview.get(Number(i.desk_folder_id)) ?? [];
    preview.set(Number(i.desk_folder_id), [
      ...list,
      { id: Number(i.id), name: i.name, art: kind === "callout" ? (i.art_key ? `/api/collection-art/${i.id}?v=${encodeURIComponent(i.art_key)}` : null) : coverUrl("project", i.id, i.art_key) },
    ]);
  }
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, name: r.name, count: Number(r.count), created_at: Number(r.created_at), art: coverUrl("folder", r.id, (r as { art_key?: string | null }).art_key), preview: preview.get(Number(r.id)) ?? [] }));
}

/** A new folder of this kind; its id. */
export async function createDeskFolder(desk: Desk, kind: FolderKind, raw: string) {
  const name = folderName(raw);
  return asPerson(desk.actor_id, async () => {
    return Number((await q.get<{ id: number }>("INSERT INTO desk_folders (user_id, kind, name, created_at) VALUES (?,?,?,?) RETURNING id", desk.id, kind, name, now()))!.id);
  });
}

/** Renames a folder. False when it isn't on this desk. */
export async function renameDeskFolder(desk: Desk, id: number, raw: string) {
  const name = folderName(raw);
  return !!(await asPerson(desk.actor_id, () => q.get("UPDATE desk_folders SET name = ? WHERE id = ? AND user_id = ? RETURNING id", name, id, desk.id)));
}

/** Deletes a folder; what was in it stays, in no folder, and its cover is queued for deletion. False when it isn't on this desk. */
export async function deleteDeskFolder(desk: Desk, id: number) {
  const gone = await asPerson(desk.actor_id, () => q.get<{ art_key: string | null }>("DELETE FROM desk_folders WHERE id = ? AND user_id = ? RETURNING art_key", id, desk.id));
  if (gone?.art_key) await discardFiles([gone.art_key], "folder deleted");
  return !!gone;
}

/**
 * Files a callout (kind "callout") or a project (kind "project") into one of the desk's folders of that kind, or out of
 * any (null). False when the item or the folder isn't on this desk, or the folder is of the other kind.
 */
export async function fileInFolder(desk: Desk, kind: FolderKind, itemId: number, folderId: number | null) {
  if (!Number.isSafeInteger(itemId) || (folderId !== null && !Number.isSafeInteger(folderId))) return false;
  return asPerson(desk.actor_id, async () => {
    if (folderId !== null && !(await q.get("SELECT 1 FROM desk_folders WHERE id = ? AND user_id = ? AND kind = ?", folderId, desk.id, kind))) return false;
    // A delete in between makes the key refuse (23503): the folder is gone, the same answer as above.
    return !!(await q.get(`UPDATE ${ITEMS[kind]} SET desk_folder_id = ? WHERE id = ? AND user_id = ? RETURNING id`, folderId, itemId, desk.id).catch((e) => {
      if ((e as { code?: string })?.code === "23503") return undefined;
      throw e;
    }));
  });
}
