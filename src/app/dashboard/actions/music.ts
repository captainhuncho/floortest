"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { IntakeError } from "@/lib/intake";
import { deleteLibraryTrack, renameLibraryTrack } from "@/lib/library";

export type MusicResult = { ok: true } | { ok: false; error: string };

/** Renames one of the desk's own tracks (My music). Owner and admins; members listen. */
export async function renameMusic(id: number, title: string, artist: string): Promise<MusicResult> {
  const u = await requireRole("admin");
  try {
    if (!(await renameLibraryTrack(u, Number(id), { title: String(title ?? ""), artist: String(artist ?? "") }))) return { ok: false, error: "That track isn't in My music any more." };
  } catch (e) {
    if (e instanceof IntakeError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/music");
  return { ok: true };
}

/** Deletes one of the desk's own tracks and its file. Owner and admins. */
export async function deleteMusic(id: number): Promise<MusicResult> {
  const u = await requireRole("admin");
  if (!(await deleteLibraryTrack(u, Number(id)))) return { ok: false, error: "That track isn't in My music any more." };
  revalidatePath("/dashboard/music");
  return { ok: true };
}
