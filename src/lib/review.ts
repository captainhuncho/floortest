/** Reviewing: listened, downloaded, played out, decisions, replies, deleting and blocking. */
import "server-only";
import { emailText } from "./email-copy";
import { drainNow, retireTrackFiles } from "./deletion";
import { isDecision, logEvent, now, q, type Decision, type Sender, type Track, type User } from "./db";
import { APP_URL, sendMailLater } from "./mail";
import { alertIfFull } from "./notify";
import { listenThreshold } from "./plans";
import { capacity } from "./desk";

const senderOf = async (t: Track) => (await q.get<Sender>("SELECT * FROM senders WHERE id = ?", t.sender_id))!;

/**
 * Listened: the client reports seconds actually heard (seeks excluded).
 * We only count it once it clears the published threshold.
 */
export async function markListened(user: User, t: Track, secondsHeard: number) {
  if (t.played_at) return false;
  if (!(secondsHeard >= listenThreshold(t.duration) - 0.5)) return false;
  const r = await q.run("UPDATE tracks SET played_at = ? WHERE id = ? AND played_at IS NULL", now(), t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "played", detail: `${Math.round(secondsHeard)}s` });
  sendMailLater({
    userId: user.id,
    to: s.email,
    ...(await emailText("listened", { sender: s.name, receiver: user.name, title: t.title, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent` })),
  });
  return true;
}

/** Downloaded: called only once the original file has been fully sent. */
export async function markDownloaded(user: User, t: Track) {
  const r = await q.run("UPDATE tracks SET downloaded_at = ? WHERE id = ? AND downloaded_at IS NULL", now(), t.id);
  if (!r.changes) return;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "downloaded", detail: "" });
  sendMailLater({
    userId: user.id,
    to: s.email,
    ...(await emailText("downloaded", { sender: s.name, receiver: user.name, title: t.title, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent` })),
  });
}

/** The best news a sender can get: their track was played in a set. Once per track; the note is optional. */
export async function markPlayedOut(user: User, t: Track, note: string) {
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 140);
  const r = await q.run("UPDATE tracks SET played_out_at = ?, played_out_note = ? WHERE id = ? AND played_out_at IS NULL", now(), clean, t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "played_out", detail: clean });
  sendMailLater({
    userId: user.id,
    to: s.email,
    ...(await emailText("played_out", { sender: s.name, receiver: user.name, title: t.title, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent`, note: clean ? ` (${clean})` : "" })),
  });
  return true;
}

/* ───────────────────────── Decisions ───────────────────────── */

/** Keep or "not for me" (stored as passed). Private to the receiver: senders are never told. Returns what undo needs. */
export async function decide(user: User, t: Track, decision: Decision) {
  const prev = { decision: t.decision, decided_at: t.decided_at };
  // Keeping (again) always puts the track in the current Prepare for set batch.
  await q.run("UPDATE tracks SET decision = ?, decided_at = ?, set_cleared_at = NULL, expiry_warned_at = NULL WHERE id = ?", decision, now(), t.id);
  const eventId = await logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: decision, detail: "" });
  return { prev, eventId };
}

export async function undoDecision(user: User, t: Track, prev: { decision: unknown; decided_at: unknown }, eventId: number) {
  // The undo token round-trips through the browser: accept only values this app could have produced.
  const decision = isDecision(prev.decision) ? prev.decision : null;
  const decidedAt = decision && typeof prev.decided_at === "number" ? prev.decided_at : null;
  await q.run("UPDATE tracks SET decision = ?, decided_at = ?, expiry_warned_at = NULL WHERE id = ?", decision, decidedAt, t.id);
  if (Number.isSafeInteger(eventId)) await q.run("DELETE FROM events WHERE id = ? AND user_id = ? AND track_id = ?", eventId, user.id, t.id);
}

export async function clearDecision(t: Track) {
  await q.run("UPDATE tracks SET decision = NULL, decided_at = NULL, expiry_warned_at = NULL WHERE id = ?", t.id);
}

export async function reply(user: User, s: Sender, t: Track | undefined, body: string) {
  sendMailLater({
    userId: user.id,
    to: s.email,
    subject: t ? `${user.name} replied about "${t.title}"` : `Message from ${user.name}`,
    body: `${body}\n\n— ${user.name}${t ? `\n\nYour receipt: ${APP_URL}/receipt/${t.token}` : ""}\n\nSent via FloorTest`,
  });
  if (t) await q.run("UPDATE tracks SET replied_at = COALESCE(replied_at, ?) WHERE id = ?", now(), t.id);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t?.id ?? null, type: "reply", detail: body });
}

/* ───────────────────────── Removal & retention ───────────────────────── */

/** Removes the audio and frees the slot. History stays attached to the sender. */
export async function deleteTrack(user: User, t: Track) {
  await q.tx(async (db) => {
    await retireTrackFiles(db, [t.id], "deleted by receiver");
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id = ?", now(), t.id);
  });
  await logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "" });
  await drainNow();
  await alertIfFull(user.id, await capacity(user)); // re-arms the "link paused" email once there's space
}

export async function setBlocked(user: User, s: Sender, blocked: boolean) {
  await q.run("UPDATE senders SET blocked_at = ? WHERE id = ?", blocked ? now() : null, s.id);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: null, type: blocked ? "blocked" : "unblocked", detail: "" });
}
