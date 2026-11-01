"use server";

/** Reviewing tracks: decisions, undo, moving, deleting, played out, notes, replies, stems, sharing, set prep and blocking. */
import { holdReply, replyNeedsApproval } from "@/lib/account-members";
import { redirect } from "next/navigation";
import { trackUse } from "@/lib/usage";
import { allow } from "@/lib/ratelimit";
import { claimOnce } from "@/lib/once";
import { requireUser, requireRole } from "@/lib/auth";
import { ownedSender, ownedTrack } from "@/lib/desk";
import { clearDecision as clearTrackDecision, decide, decisionLocked, deleteTrack as removeTrack, markPlayedOut, reply, setBlocked, undoDecision as restoreDecision } from "@/lib/review";
import { asPerson, asSystem, isDecision, logEvent, now, q, type Decision } from "@/lib/db";
import { audit, trackLabel } from "@/lib/audit";
import { requestStems } from "@/lib/stems";
import { parseCues } from "@/lib/cues";
import { done, ownCollection } from "./common";
import { canMarkPlayedOut, closePlayedOutPrompt, markableOnPrepare, playedOutPicks, playedOutPrompt } from "@/lib/played-out-prompt";

export type UndoToken = { trackId: number; prev: { decision: Decision | null; decided_at: number | null }; eventId: number };

export async function decideTrack(trackId: number, decision: Decision): Promise<UndoToken | null> {
  const u = await requireUser();
  if (!isDecision(decision)) return null;
  const t = await ownedTrack(u, trackId);
  if (!t) return null;
  // An owner's or admin's call stands against a member: refresh so the desk shows it as it is.
  if (decisionLocked(u, t)) return done(), null;
  await trackUse(u.id, "decide");
  // The change itself runs under the per-person rules (B8); usage and the audit log stay the app's own.
  const r = await asPerson(u.actor_id, () => decide(u, t, decision));
  if (!r) return done(), null; // an owner's or admin's call landed since the page loaded
  await audit(u.id, decision, trackLabel(t), t.id);
  done();
  return { trackId, ...r };
}

/** Back to Needs review. Used when a receiver toggles off Keep or Not for me. */
export async function clearDecision(trackId: number) {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  if (!t || decisionLocked(u, t)) return done();
  if (!(await asPerson(u.actor_id, () => clearTrackDecision(u, t)))) return done();
  await audit(u.id, "decision_cleared", trackLabel(t), t.id);
  done();
}

export async function undoDecision(token: UndoToken) {
  const u = await requireUser();
  const t = await ownedTrack(u, Number(token?.trackId));
  if (!t || decisionLocked(u, t)) return done();
  await asPerson(u.actor_id, () => restoreDecision(u, t, token.prev ?? {}, Number(token.eventId)));
  await audit(u.id, "decision_undone", trackLabel(t), t.id);
  done();
}

export async function moveTrack(trackId: number, form: FormData) {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  const target = await ownCollection(u.id, Number(form.get("collection")));
  if (!t || !target || t.collection_id === target.id) return;
  await q.run("UPDATE tracks SET collection_id = ? WHERE id = ?", target.id, t.id);
  await logEvent({ user_id: u.id, actor_id: u.actor_id, sender_id: t.sender_id, track_id: t.id, type: "moved", detail: `to ${target.name}` });
  await audit(u.id, "moved", `${trackLabel(t)} to ${target.name}`, t.id);
  done();
}

export async function deleteTrack(trackId: number, back: string) {
  const u = await requireRole("admin");
  const t = await ownedTrack(u, trackId);
  if (!t) return;
  // The track was found as the person (ownedTrack); retiring its files needs the app's own connection, on purpose.
  await asSystem(() => removeTrack(u, t));
  await audit(u.id, "deleted_track", trackLabel(t));
  done();
  redirect(back.startsWith("/dashboard") ? back : "/dashboard/review");
}

/** Starts a new Prepare for set batch. Tracks stay kept; they just leave the page. */
export async function clearKept() {
  const u = await requireRole("admin");
  const r = await q.run(
    "UPDATE tracks SET set_cleared_at = ? WHERE user_id = ? AND decision = 'kept' AND set_cleared_at IS NULL AND deleted_at IS NULL",
    now(),
    u.id,
  );
  await audit(u.id, "set_cleared", `${r.changes} track${r.changes === 1 ? "" : "s"}`);
  done();
}

/** Kept tracks only: tells the sender it was played in a set. */
export async function playedOut(trackId: number, note: string) {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  if (!t || t.decision !== "kept") return false;
  await trackUse(u.id, "played_out");
  const ok = await markPlayedOut(u, t, String(note || ""));
  if (ok) await audit(u.id, "played_out", trackLabel(t), t.id);
  done();
  return ok;
}

/**
 * The pick page (any day) and Prepare's "Played it out": tells each chosen sender their kept track was played out.
 * DJ desks only, owner and A&R / Admin. From the pick page, only its list (kept in the last 14 days, not
 * evaluation-only) can be marked, and an open Monday prompt closes for the week. From Prepare, any kept track the
 * sender didn't mark evaluation-only.
 */
export async function playedOutBatch(trackIds: number[], note: string, from: "pick" | "prepare" = "pick") {
  const u = await requireRole("admin");
  if (!canMarkPlayedOut(u)) return 0;
  const prompt = from === "pick" ? await playedOutPrompt(u) : null;
  const picks = from === "pick" ? await playedOutPicks(u) : null;
  const allowed = picks ? new Set(picks.tracks.map((t) => t.id)) : null;
  let marked = 0;
  for (const id of (Array.isArray(trackIds) ? trackIds : []).slice(0, 50)) {
    if (allowed && !allowed.has(id)) continue;
    const t = await ownedTrack(u, id);
    if (!t || !markableOnPrepare(t) || !(await markPlayedOut(u, t, String(note || "")))) continue;
    await audit(u.id, "played_out", trackLabel(t), t.id);
    marked++;
  }
  if (prompt) await closePlayedOutPrompt(u.id, prompt.key);
  if (marked) await trackUse(u.id, "played_out");
  done();
  return marked;
}

/** "None this weekend": closes the Monday prompt without telling anyone anything. */
export async function skipPlayedOutPrompt() {
  const u = await requireRole("admin");
  const prompt = await playedOutPrompt(u);
  if (prompt) await closePlayedOutPrompt(u.id, prompt.key);
  done();
}

const templatesOf = async (userId: number) => {
  const row = await q.get<{ t: string }>("SELECT reply_templates AS t FROM users WHERE id = ?", userId);
  try {
    const list = JSON.parse(row?.t || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
};

export async function getReplyTemplates(): Promise<string[]> {
  return templatesOf((await requireUser()).id);
}

export async function saveReplyTemplate(text: string): Promise<string[]> {
  const u = await requireUser();
  const t = String(text || "").trim().slice(0, 2000);
  const list = await templatesOf(u.id);
  if (t && !list.includes(t) && list.length < 10) list.push(t);
  await q.run("UPDATE users SET reply_templates = ? WHERE id = ?", JSON.stringify(list), u.id);
  return list;
}

export async function deleteReplyTemplate(index: number): Promise<string[]> {
  const u = await requireUser();
  const list = (await templatesOf(u.id)).filter((_, i) => i !== index);
  await q.run("UPDATE users SET reply_templates = ? WHERE id = ?", JSON.stringify(list), u.id);
  return list;
}

export async function addNote(senderId: number, trackId: number | null, form: FormData) {
  const u = await requireUser();
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  const s = await ownedSender(u, senderId);
  if (!body || !s) return;
  // The track must be this sender's, so a note can't be filed against someone else's music.
  if (trackId && (await ownedTrack(u, trackId))?.sender_id !== s.id) return;
  // Written as the person (B8): the database also checks the note lands on a desk they may work.
  await asPerson(u.actor_id, () => logEvent({ user_id: u.id, actor_id: u.actor_id, sender_id: senderId, track_id: trackId, type: "note", detail: body }));
  await audit(u.id, "noted", s.name, trackId);
  done();
}

/** A word-for-word repeat of a reply inside this window is treated as the same reply. */
const REPLY_REPEAT_MS = 10 * 60_000;

/** What happened to a reply, for the reply box to say (owner, 25 Oct: a limited or repeated reply used to look sent). */
/** `refused`: nothing happened, so the text stays in the box to try again; the others close it. */
export type ReplyResult = { status: "sent" | "held" | "repeat" | "refused"; message: string };

export async function replyToSender(senderId: number, trackId: number | null, form: FormData): Promise<ReplyResult> {
  const u = await requireUser();
  await trackUse(u.id, "reply");
  const s = await ownedSender(u, senderId);
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  if (!s) return { status: "refused", message: "Not sent: that sender isn't on this desk." };
  if (!body) return { status: "refused", message: "Write a message first." };
  // Replies are real email from our address: cap them so an account can't be used to mail people in bulk.
  const hourOk = await allow("reply_user", String(u.id), 60, 3_600_000);
  if (!hourOk || !(await allow("reply_to", `${u.id}:${s.id}`, 8, 86_400_000))) {
    await audit(u.id, "reply_limited", s.name, trackId);
    return {
      status: "refused",
      message: hourOk
        ? `Not sent: that's 8 replies to ${s.name} today, the most a day. Try again tomorrow.`
        : "Not sent: that's 60 replies this hour, the most in an hour. Try again later.",
    };
  }
  // Only this sender's own track: the reply email carries its private receipt link.
  const t = trackId ? await ownedTrack(u, trackId) : undefined;
  if (trackId && t?.sender_id !== s.id) return { status: "refused", message: "Not sent: that track isn't on this desk." };
  // A double tap or a retried form must not email the sender twice: the same reply from the same person to the same
  // sender and track goes out once in REPLY_REPEAT_MS (Codex review, phase B item 2).
  if (!(await claimOnce("reply", [u.id, u.actor_id ?? u.id, s.id, t?.id ?? null, body], REPLY_REPEAT_MS))) {
    done();
    return { status: "repeat", message: `Already sent: ${s.name} got this exact reply in the last 10 minutes.` };
  }
  // On a team desk with approval on, a member's reply waits for the approver instead of going out.
  if (await replyNeedsApproval(u)) {
    await asPerson(u.actor_id, () => holdReply(u, s.id, t?.id ?? null, body));
    await audit(u.id, "reply_held", s.name, trackId);
    done();
    return { status: "held", message: `Waiting for approval. It goes to ${s.name} once it's approved.` };
  }
  // The sender and track were found as the person (ownedSender, ownedTrack). The email is queued in the same transaction
  // as the track's "replied" mark, and the mail queue is the app's own, so this runs as the app on purpose.
  await asSystem(() => reply(u, s, t, body));
  await audit(u.id, "replied", s.name, trackId);
  done();
  return { status: "sent", message: `Reply emailed to ${s.name}.` };
}

/** Asks the sender for stems (emails them once) so they can upload them from their receipt page. */
export async function askForStems(trackId: number) {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  if (!t) return;
  await requestStems(u, t);
  await audit(u.id, "stems_requested", trackLabel(t), t.id);
  done();
}

/** Set prep on a kept track: energy (1–5, or null) and labelled cue points. */
export async function savePrep(trackId: number, energy: number | null, cues: { at: number; label: string }[]) {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  if (!t) return;
  const e = energy && Number.isInteger(energy) && energy >= 1 && energy <= 5 ? energy : null;
  const clean = parseCues(JSON.stringify(cues), t.duration);
  await q.run("UPDATE tracks SET energy = ?, cues = ? WHERE id = ?", e, JSON.stringify(clean), t.id);
  done();
}

export async function blockSender(senderId: number, blocked: boolean) {
  const u = await requireRole("admin");
  const s = await ownedSender(u, senderId);
  if (!s) return;
  await setBlocked(u, s, !!blocked);
  await audit(u.id, blocked ? "blocked" : "unblocked", s.name);
  done();
}

/** Keep or pass every track of a release still waiting for a decision, in one go. */
export async function decideRelease(releaseId: string, decision: Decision) {
  const u = await requireUser();
  if (!isDecision(decision)) return;
  const tracks = await q.all<{ id: number }>(
    "SELECT id FROM tracks WHERE user_id = ? AND release_id = ? AND deleted_at IS NULL AND decision IS NULL",
    u.id,
    releaseId,
  );
  for (const { id } of tracks) {
    const t = await ownedTrack(u, id);
    if (t) await decide(u, t, decision);
  }
  await trackUse(u.id, "decide");
  await audit(u.id, decision, `release · ${tracks.length} tracks`);
  done();
}
