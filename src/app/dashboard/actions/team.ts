"use server";

/** Review Together on a team desk: comments and the shared shortlist. */
import { requireUser } from "@/lib/auth";
import { addComment, removeComment, reviewTrack, toggleShortlist } from "@/lib/team";
import { allow } from "@/lib/ratelimit";
import { done } from "./common";

export async function commentOnTrack(trackId: number, _prev: string | null, form: FormData): Promise<string | null> {
  const u = await requireUser();
  const t = await reviewTrack(u, trackId);
  if (!t) return "You can't comment on this track.";
  if (!(await allow("comment", String(u.actor_id), 120, 3_600_000))) return "Too many comments. Try again shortly.";
  const body = String(form.get("body") || "").trim();
  if (!body) return "Write something first.";
  await addComment(u.actor_id, t, body);
  done();
  return null;
}

export async function deleteComment(commentId: number) {
  const u = await requireUser();
  await removeComment(u, Number(commentId));
  done();
}

export async function shortlistTrack(trackId: number) {
  const u = await requireUser();
  const t = await reviewTrack(u, trackId);
  if (!t) return;
  await toggleShortlist(u.actor_id, t);
  done();
}
