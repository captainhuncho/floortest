"use server";

/** Folders to organise callouts and projects (owner, 16 Nov). Owner and admins; a folder never mixes the two kinds. */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createDeskFolder, deleteDeskFolder, fileInFolder, isFolderKind, renameDeskFolder, type FolderKind } from "@/lib/desk-folders";
import { recordId } from "@/lib/ids";
import { IntakeError } from "@/lib/intake";

export type FolderResult = { ok: true; id?: number } | { ok: false; error: string };

const GONE = "That folder isn't there any more.";
const PATHS: Record<FolderKind, string> = { callout: "/dashboard/collections", project: "/dashboard/projects" };

async function attempt(kind: FolderKind, run: () => Promise<boolean | number>, gone = GONE): Promise<FolderResult> {
  try {
    const r = await run();
    if (r === false) return { ok: false, error: gone };
    revalidatePath(PATHS[kind], "layout");
    return typeof r === "number" ? { ok: true, id: r } : { ok: true };
  } catch (e) {
    if (e instanceof IntakeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** A new callout or project folder. */
export async function createFolder(kind: FolderKind, name: string): Promise<FolderResult> {
  const u = await requireRole("admin");
  if (!isFolderKind(kind)) return { ok: false, error: GONE };
  return attempt(kind, () => createDeskFolder(u, kind, String(name ?? "")));
}

export async function renameFolder(kind: FolderKind, id: number, name: string): Promise<FolderResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (!isFolderKind(kind) || rid === null) return { ok: false, error: GONE };
  return attempt(kind, () => renameDeskFolder(u, rid, String(name ?? "")));
}

/** Deletes a folder; the callouts or projects in it stay, in no folder. */
export async function deleteFolder(kind: FolderKind, id: number): Promise<FolderResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (!isFolderKind(kind) || rid === null) return { ok: false, error: GONE };
  return attempt(kind, () => deleteDeskFolder(u, rid));
}

/** Puts a callout into one of the desk's callout folders, or out of any (folder null). */
export async function fileCallout(calloutId: number, folder: number | null): Promise<FolderResult> {
  return file(await requireRole("admin"), "callout", calloutId, folder);
}

/** Puts a project into one of the desk's project folders, or out of any (folder null). */
export async function fileProject(projectId: number, folder: number | null): Promise<FolderResult> {
  return file(await requireRole("admin"), "project", projectId, folder);
}

async function file(u: Awaited<ReturnType<typeof requireRole>>, kind: FolderKind, itemId: number, folder: number | null) {
  const item = recordId(itemId);
  const target = folder === null ? null : recordId(folder);
  if (item === null || (folder !== null && target === null)) return { ok: false as const, error: GONE };
  return attempt(kind, () => fileInFolder(u, kind, item, target), "That folder or item isn't there any more.");
}
