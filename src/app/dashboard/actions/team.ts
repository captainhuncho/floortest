"use server";

/** Shared collections: teammates and their votes. */
import { redirect } from "next/navigation";
import { trackUse } from "@/lib/usage";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addMember, castVote, memberTrack, removeMember } from "@/lib/team";
import { done, ownCollection } from "./common";

export async function addTeammate(collectionId: number, _prev: string | null, form: FormData): Promise<string | null> {
  const u = await requireUser();
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
  const u = await requireUser();
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
