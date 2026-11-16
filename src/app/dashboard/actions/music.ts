"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { folderId, recordId } from "@/lib/ids";
import { IntakeError } from "@/lib/intake";
import { createFolder, deleteFolder, deleteLibraryTrack, moveAllOwnToProjects, moveLibraryTrack, moveManyToProjects as moveManyFromCollections, moveTrackToProjects, renameFolder, renameLibraryTrack, type MoveManyResult, type MoveTarget } from "@/lib/library";
import { allow } from "@/lib/ratelimit";

export type MusicResult = { ok: true } | { ok: false; error: string };

const GONE = "That track isn't in Projects any more.";

/** Runs a change, turning a refusal (a missing name, too many projects) into its message. */
async function attempt(run: () => Promise<boolean>, gone: string): Promise<MusicResult> {
  try {
    if (!(await run())) return { ok: false, error: gone };
  } catch (e) {
    if (e instanceof IntakeError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/projects", "layout");
  return { ok: true };
}

/** Renames one of the desk's own tracks (Projects). Owner and admins; members listen. */
export async function renameMusic(id: number, title: string, artist: string): Promise<MusicResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (rid === null) return { ok: false, error: GONE };
  return attempt(() => renameLibraryTrack(u, rid, { title: String(title ?? ""), artist: String(artist ?? "") }), GONE);
}

/** Deletes one of the desk's own tracks and its file. Owner and admins. */
export async function deleteMusic(id: number): Promise<MusicResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (rid === null) return { ok: false, error: GONE };
  return attempt(() => deleteLibraryTrack(u, rid), GONE);
}

/** Moves one of the desk's own tracks into a project, or out of any (null). Owner and admins. */
export async function moveMusic(id: number, folder: number | null): Promise<MusicResult> {
  const u = await requireRole("admin");
  const f = folderId(folder);
  const rid = recordId(id);
  if (rid === null) return { ok: false, error: GONE };
  if (Number.isNaN(f)) return { ok: false, error: "Choose a project." };
  return attempt(() => moveLibraryTrack(u, rid, f), "That track or project isn't there any more.");
}

/** A new project (a folder in Projects). Owner and admins. */
export async function createProject(name: string): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const u = await requireRole("admin");
  try {
    const id = await createFolder(u, String(name ?? ""));
    revalidatePath("/dashboard/projects", "layout");
    return { ok: true, id };
  } catch (e) {
    if (e instanceof IntakeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Renames a project. Owner and admins. */
export async function renameProject(id: number, name: string): Promise<MusicResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (rid === null) return { ok: false, error: "That project isn't there any more." };
  return attempt(() => renameFolder(u, rid, String(name ?? "")), "That project isn't there any more.");
}

/** Deletes a project; its tracks stay in Projects, in no project. Owner and admins. */
export async function deleteProject(id: number): Promise<MusicResult> {
  const u = await requireRole("admin");
  const rid = recordId(id);
  if (rid === null) return { ok: false, error: "That project isn't there any more." };
  return attempt(() => deleteFolder(u, rid), "That project isn't there any more.");
}

/**
 * Moves a track the desk added to a collection itself into Projects (owner, 13 Nov: own uploads only, never a
 * sender's). Owner and admins.
 */
export async function moveToProjects(trackId: number, folder: number | null): Promise<MusicResult> {
  const u = await requireRole("admin");
  const f = folderId(folder);
  const rid = recordId(trackId);
  if (rid === null) return { ok: false, error: "That track isn't there any more." };
  if (Number.isNaN(f)) return { ok: false, error: "Choose a project." };
  const r = await moveTrackToProjects(u, rid, f);
  if (!r.ok) return r;
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Moves picked tracks into Projects (a project, a new one, or none); own uploads only, each on its own. Owner and admins.
 * Throttled like the List view's batch (60 an hour per person): abuse protection, never a limit on folders or projects.
 */
export async function moveManyToProjects(trackIds: number[], target: MoveTarget): Promise<MoveManyResult> {
  const u = await requireRole("admin");
  // Charged before the batch is checked, on purpose: a stream of junk batches is throttled too, and checking is cheap.
  if (!(await allow("move_projects", String(u.actor_id), 60, 3_600_000))) return { ok: false, error: "Too many moves at once. Try again shortly." };
  const r = await moveManyFromCollections(u, trackIds, target);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}

/** 1b: moves all the desk's own uploads from its collections into Projects (never a sender's). Owner and admins. */
export async function moveAllToProjects(): Promise<{ ok: true; moved: number; left: number; full: boolean }> {
  const u = await requireRole("admin");
  const r = await moveAllOwnToProjects(u);
  revalidatePath("/dashboard", "layout");
  return { ok: true, ...r };
}
