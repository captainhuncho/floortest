"use server";

/** Shared collections: teammates and their votes. */
import { redirect } from "next/navigation";
import { trackUse } from "@/lib/usage";
import { requireUser, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addComment, addMember, castVote, memberTrack, removeComment, removeMember, reviewTrack, toggleShortlist } from "@/lib/team";
import { allow } from "@/lib/ratelimit";
import { q, USER_COLUMNS, type User } from "@/lib/db";
import { decide } from "@/lib/review";
import { trackLabel } from "@/lib/audit";
import { done, ownCollection } from "./common";

export async function addTeammate(collectionId: number, _prev: string | null, form: FormData): Promise<string | null> {
  const u = await requireRole("admin");
  await trackUse(u.id, "teammates");
  const c = await ownCollection(u.id, collectionId);
  if (!c) return null;
  const who = String(form.get("who") || "");
  const err = await addMember(u, c, who);
  if (err) return err;
  await audit(u.id, "teammate_added", `${c.name}: ${who.trim()}`);
  done();
  return null;
}

export async function removeTeammate(collectionId: number, userId: number) {
  const u = await requireRole("admin");
  const c = await ownCollection(u.id, collectionId);
  if (!c) return;
  await removeMember(c.id, userId);
  await audit(u.id, "teammate_removed", c.name);
  done();
}

/** A teammate leaving a collection someone shared with them. */
export async function leaveShared(collectionId: number) {
  const u = await requireUser();
  await removeMember(collectionId, u.id);
  done();
  redirect("/dashboard/collections");
}

export async function voteOnTrack(trackId: number, vote: "keep" | "pass", form: FormData) {
  const u = await requireUser();
  await trackUse(u.id, "vote");
  if (vote !== "keep" && vote !== "pass") return;
  const t = await memberTrack(u.id, trackId);
  if (!t) return;
  await castVote(u.id, t, vote, String(form.get("note") || ""));
  done();
}

/* Review Together: comments, the shared shortlist, and (if the owner allows) teammates making the call. */

export async function commentOnTrack(trackId: number, _prev: string | null, form: FormData): Promise<string | null> {
  const u = await requireUser();
  const r = await reviewTrack(u.id, trackId);
  if (!r) return "You can't comment on this track.";
  if (!(await allow("comment", String(u.id), 120, 3_600_000))) return "Too many comments. Try again shortly.";
  const body = String(form.get("body") || "").trim();
  if (!body) return "Write something first.";
  await addComment(u.id, r.track, body);
  done();
  return null;
}

export async function deleteComment(commentId: number) {
  const u = await requireUser();
  await removeComment(u.id, Number(commentId));
  done();
}

export async function shortlistTrack(trackId: number) {
  const u = await requireUser();
  const r = await reviewTrack(u.id, trackId);
  if (!r) return;
  await toggleShortlist(u.id, r.track);
  done();
}

/** A teammate makes the Keep / Not for me call, only where the owner turned that on. Recorded as the owner's decision, with who made it. */
export async function teamDecide(trackId: number, decision: "kept" | "passed") {
  const u = await requireUser();
  if (decision !== "kept" && decision !== "passed") return;
  const t = await memberTrack(u.id, trackId);
  if (!t) return;
  const c = await q.get<{ team_can_decide: number }>("SELECT team_can_decide FROM collections WHERE id = ?", t.collection_id);
  if (!c?.team_can_decide) return;
  const owner = await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, t.user_id);
  if (!owner) return;
  if (t.decision !== decision) await decide(owner, t, decision);
  await audit(owner.id, decision, `${trackLabel(t)} · by ${u.name}`, t.id);
  done();
}

/** Owner: let teammates make the Keep / Not for me call in this collection (off by default). */
export async function setTeamCanDecide(collectionId: number, on: boolean) {
  const u = await requireRole("admin");
  const c = await ownCollection(u.id, collectionId);
  if (!c) return;
  await q.run("UPDATE collections SET team_can_decide = ? WHERE id = ?", on ? 1 : 0, c.id);
  await audit(u.id, "settings_updated", `${c.name}: teammates ${on ? "can" : "can't"} keep or pass`);
  done();
}
