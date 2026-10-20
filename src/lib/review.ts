/** Reviewing: listened, downloaded, played out, decisions, replies, deleting and blocking. */
import "server-only";
import { emailText } from "./email-copy";
import { drainNow, retireTrackFiles } from "./deletion";
import { isDecision, logEvent, now, q, type Decision, type Sender, type Track, type User } from "./db";
import { APP_URL, sendMailLater } from "./mail";
import { alertIfFull } from "./notify";
import { LISTEN_BEAT_CAP_MS, listenThreshold } from "./plans";
import { capacity, reopenCallouts } from "./desk";

const senderOf = async (t: Track) => (await q.get<Sender>("SELECT * FROM senders WHERE id = ?", t.sender_id))!;

/**
 * Listened, counted by the server (Codex review, 19 Oct). "play" starts (or resumes) this person's listen on this sign-in
 * without crediting anything; each "beat" while playing adds the real time since the last check-in, capped at
 * LISTEN_BEAT_CAP_MS. A listen started from another sign-in starts again from zero, and one row per person and track
 * means extra tabs can't add up. The track counts as listened once the server's own total clears the published
 * threshold. The browser still says whether audio is playing; it can no longer say how long. Returns true the first time.
 */
export async function recordListen(user: User, t: Track, kind: "play" | "beat", session: string, at = now()) {
  if (t.played_at) return false;
  if (kind === "play") {
    await q.run(
      `INSERT INTO listens (track_id, actor_id, session_hash, started_at, last_beat_at, credited_ms) VALUES (?,?,?,?,?,0)
       ON CONFLICT (track_id, actor_id) DO UPDATE SET
         credited_ms = CASE WHEN listens.session_hash = excluded.session_hash THEN listens.credited_ms ELSE 0 END,
         started_at = CASE WHEN listens.session_hash = excluded.session_hash THEN listens.started_at ELSE excluded.started_at END,
         session_hash = excluded.session_hash, last_beat_at = excluded.last_beat_at`,
      t.id, user.actor_id, session, at, at,
    );
    return false;
  }
  const row = await q.get<{ credited_ms: number }>(
    `UPDATE listens SET credited_ms = credited_ms + LEAST(GREATEST(? - last_beat_at, 0), ?), last_beat_at = ?
     WHERE track_id = ? AND actor_id = ? AND session_hash = ? AND last_beat_at IS NOT NULL AND last_beat_at <= ?
     RETURNING credited_ms`,
    at, LISTEN_BEAT_CAP_MS, at, t.id, user.actor_id, session, at,
  );
  if (!row) return false;
  const first = await markListened(user, t, Number(row.credited_ms) / 1000);
  if (first) await q.run("DELETE FROM listens WHERE track_id = ?", t.id);
  return first;
}

/**
 * Listened: called with seconds the server has credited (recordListen), never a number from the browser. Counts once it
 * clears the published threshold.
 */
async function markListened(user: User, t: Track, secondsHeard: number) {
  if (t.played_at) return false;
  if (!(secondsHeard >= listenThreshold(t.duration) - 0.5)) return false;
  const r = await q.run("UPDATE tracks SET played_at = ? WHERE id = ? AND played_at IS NULL", now(), t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: s.id, track_id: t.id, type: "played", detail: `${Math.round(secondsHeard)}s` });
  sendMailLater({
    userId: user.id,
    to: s.email,
    secrets: [t.token],
    ...(await emailText("listened", { sender: s.name, receiver: user.name, title: t.title, artist: t.artist, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent` })),
  });
  return true;
}

/** Downloaded: called only once the original file has been fully sent. */
export async function markDownloaded(user: User, t: Track) {
  const r = await q.run("UPDATE tracks SET downloaded_at = ? WHERE id = ? AND downloaded_at IS NULL", now(), t.id);
  if (!r.changes) return;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: s.id, track_id: t.id, type: "downloaded", detail: "" });
  sendMailLater({
    userId: user.id,
    to: s.email,
    secrets: [t.token],
    ...(await emailText("downloaded", { sender: s.name, receiver: user.name, title: t.title, artist: t.artist, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent` })),
  });
}

/** The best news a sender can get: their track was played in a set. Once per track; the note is optional. */
export async function markPlayedOut(user: User, t: Track, note: string) {
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 140);
  const r = await q.run("UPDATE tracks SET played_out_at = ?, played_out_note = ? WHERE id = ? AND played_out_at IS NULL", now(), clean, t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: s.id, track_id: t.id, type: "played_out", detail: clean });
  sendMailLater({
    userId: user.id,
    to: s.email,
    secrets: [t.token],
    ...(await emailText("played_out", { sender: s.name, receiver: user.name, title: t.title, artist: t.artist, receipt_url: `${APP_URL}/receipt/${t.token}`, sent_url: `${APP_URL}/sent`, note: clean ? ` (${clean})` : "" })),
  });
  return true;
}

/* ───────────────────────── Decisions ───────────────────────── */

/**
 * On a team desk, a call made by the owner or an A&R / Admin stands: a member can't change or clear it. Owners and admins
 * can change anyone's.
 */
export const decisionLocked = (user: Pick<User, "role">, t: Pick<Track, "decision" | "decided_role">) =>
  user.role === "member" && !!t.decision && (t.decided_role === "owner" || t.decided_role === "admin");
export const LOCKED_MESSAGE = "The owner or an A&R / Admin made this call, so only they can change it.";

/** Keep or "not for me" (stored as passed). Private to the receiver: senders are never told. Returns what undo needs. */
export async function decide(user: User, t: Track, decision: Decision) {
  const prev = { decision: t.decision, decided_at: t.decided_at };
  // Keeping (again) always puts the track in the current Prepare for set batch.
  await q.run(
    "UPDATE tracks SET decision = ?, decided_at = ?, decided_by = ?, decided_role = ?, set_cleared_at = NULL, expiry_warned_at = NULL WHERE id = ?",
    decision,
    now(),
    user.actor_id ?? user.id,
    user.role ?? "owner",
    t.id,
  );
  const eventId = await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: t.sender_id, track_id: t.id, type: decision, detail: "" });
  return { prev, eventId };
}

export async function undoDecision(user: User, t: Track, prev: { decision: unknown; decided_at: unknown }, eventId: number) {
  // The undo token round-trips through the browser: accept only values this app could have produced.
  const decision = isDecision(prev.decision) ? prev.decision : null;
  const decidedAt = decision && typeof prev.decided_at === "number" ? prev.decided_at : null;
  // Who made the restored call isn't in the undo token, so it comes back unlocked rather than credited to the undoer.
  await q.run("UPDATE tracks SET decision = ?, decided_at = ?, decided_by = NULL, decided_role = NULL, expiry_warned_at = NULL WHERE id = ?", decision, decidedAt, t.id);
  // Only the entry this undo is about: the undoer's own keep or not-for-me on this track, never a teammate's note or call
  // (the event id comes back from the browser, so it's checked, not trusted).
  if (Number.isSafeInteger(eventId))
    await q.run(
      "DELETE FROM events WHERE id = ? AND user_id = ? AND track_id = ? AND type IN ('kept', 'passed') AND COALESCE(actor_id, user_id) = ?",
      eventId,
      user.id,
      t.id,
      user.actor_id ?? user.id,
    );
}

export async function clearDecision(t: Track) {
  await q.run("UPDATE tracks SET decision = NULL, decided_at = NULL, decided_by = NULL, decided_role = NULL, expiry_warned_at = NULL WHERE id = ?", t.id);
}

export async function reply(user: User, s: Sender, t: Track | undefined, body: string) {
  sendMailLater({
    userId: user.id,
    to: s.email,
    secrets: [t?.token],
    subject: t ? `${user.name} replied about "${t.title}"` : `Message from ${user.name}`,
    body: `${body}\n\n— ${user.name}${t ? `\n\nYour receipt: ${APP_URL}/receipt/${t.token}` : ""}\n\nSent via FloorTest`,
  });
  if (t) await q.run("UPDATE tracks SET replied_at = COALESCE(replied_at, ?) WHERE id = ?", now(), t.id);
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: s.id, track_id: t?.id ?? null, type: "reply", detail: body });
}

/* ───────────────────────── Removal & retention ───────────────────────── */

/** Removes the audio and frees the slot. History stays attached to the sender. */
export async function deleteTrack(user: User, t: Track) {
  await q.tx(async (db) => {
    await retireTrackFiles(db, [t.id], "deleted by receiver");
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL, art_key = NULL WHERE id = ?", now(), t.id);
    await reopenCallouts(db);
  });
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "" });
  await drainNow();
  await alertIfFull(user.id, await capacity(user)); // re-arms the "link paused" email once there's space
}

export async function setBlocked(user: User, s: Sender, blocked: boolean) {
  await q.run("UPDATE senders SET blocked_at = ? WHERE id = ?", blocked ? now() : null, s.id);
  await logEvent({ user_id: user.id, actor_id: user.actor_id, sender_id: s.id, track_id: null, type: blocked ? "blocked" : "unblocked", detail: "" });
}
