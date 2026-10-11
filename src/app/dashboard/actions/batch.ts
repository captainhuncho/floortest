"use server";

/** Acting on several tracks at once from the List view: keep, not for me, back to needs review, move, delete. */
import { requireUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { trackUse } from "@/lib/usage";
import { BATCH_MAX } from "@/lib/batch";
import { audit } from "@/lib/audit";
import { logEvent, q, type Track } from "@/lib/db";
import { clearDecision, decide, decisionLocked, deleteTrack } from "@/lib/review";
import { done, ownCollection } from "./common";

export type BatchAction = { type: "kept" | "passed" | "clear" } | { type: "move"; collection: number } | { type: "delete"; confirm: string };
export type BatchResult = { done: number; skipped: number; error?: string };

/**
 * Applies one action to the chosen tracks. Only the signed-in receiver's own, not-deleted tracks are touched; anything else
 * in the list is skipped. Decisions stay private exactly as one-by-one (senders never see keep or pass).
 */
export async function batchTracks(ids: number[], action: BatchAction): Promise<BatchResult> {
  const u = await requireUser();
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!wanted.length) return { done: 0, skipped: 0, error: "Choose some tracks first." };
  if (wanted.length > BATCH_MAX) return { done: 0, skipped: wanted.length, error: `Up to ${BATCH_MAX} tracks at a time.` };
  if (!(await allow("batch", String(u.id), 60, 3_600_000))) return { done: 0, skipped: wanted.length, error: "Too many changes at once. Try again shortly." };
  const type = action?.type;
  if (type === "delete" && (action as { confirm?: string }).confirm !== "delete") return { done: 0, skipped: wanted.length, error: "Confirm the delete first." };
  if (type === "delete" && u.role === "member") return { done: 0, skipped: wanted.length, error: "Only the owner or an admin can delete tracks." };

  const tracks = await q.all<Track>(
    `SELECT * FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND id IN (${wanted.map(() => "?").join(",")})`,
    u.id,
    ...wanted,
  );
  let changed = 0;
  let locked = 0;
  let where = "";
  if (type === "kept" || type === "passed") {
    // An owner's or admin's call stands against a member's batch (counted as skipped).
    for (const t of tracks) if (t.decision !== type) decisionLocked(u, t) ? locked++ : (await decide(u, t, type), changed++);
    await trackUse(u.id, "decide");
  } else if (type === "clear") {
    for (const t of tracks) if (t.decision) decisionLocked(u, t) ? locked++ : (await clearDecision(t), changed++);
  } else if (type === "move") {
    const target = await ownCollection(u.id, Number((action as { collection: number }).collection));
    if (!target) return { done: 0, skipped: wanted.length, error: "Choose a collection." };
    for (const t of tracks) {
      if (t.collection_id === target.id) continue;
      await q.run("UPDATE tracks SET collection_id = ? WHERE id = ?", target.id, t.id);
      await logEvent({ user_id: u.id, actor_id: u.actor_id, sender_id: t.sender_id, track_id: t.id, type: "moved", detail: `to ${target.name}` });
      changed++;
    }
    where = ` to ${target.name}`;
  } else if (type === "delete") {
    for (const t of tracks) (await deleteTrack(u, t), changed++);
  } else {
    return { done: 0, skipped: wanted.length, error: "Unknown action." };
  }
  // One line in the activity log for the whole batch.
  const kind = ({ kept: "kept", passed: "passed", clear: "decision_cleared", move: "moved", delete: "deleted_track" } as const)[type];
  await audit(u.id, kind, `batch · ${changed} track${changed === 1 ? "" : "s"}${where}`);
  done();
  return { done: changed, skipped: wanted.length - tracks.length + locked };
}
