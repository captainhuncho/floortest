"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  decide,
  deleteTrack as removeTrack,
  ownedSender,
  ownedTrack,
  reply,
  setBlocked,
  undoDecision as restoreDecision,
} from "@/lib/core";
import { db, logEvent, now, type Decision } from "@/lib/db";
import { sendDigest } from "@/lib/notify";
import { cleanGenre, PLANS, RESERVED_HANDLES } from "@/lib/plans";

const done = () => revalidatePath("/dashboard", "layout");

function ownCollection(userId: number, id: number) {
  return db().prepare("SELECT id, name FROM collections WHERE id = ? AND user_id = ?").get(id, userId) as
    | { id: number; name: string }
    | undefined;
}

/* Collections */

export async function createCollection(form: FormData) {
  const u = await requireUser();
  const name = String(form.get("name") || "").trim().slice(0, 60);
  if (!name) return;
  const r = db().prepare("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)").run(u.id, name, now());
  if (form.get("activate")) db().prepare("UPDATE users SET active_collection_id = ? WHERE id = ?").run(Number(r.lastInsertRowid), u.id);
  done();
}

export async function setActiveCollection(id: number) {
  const u = await requireUser();
  if (!ownCollection(u.id, id)) return;
  db().prepare("UPDATE users SET active_collection_id = ? WHERE id = ?").run(id, u.id);
  done();
}

export async function updateCollection(id: number, form: FormData) {
  const u = await requireUser();
  if (!ownCollection(u.id, id)) return;
  const name = String(form.get("name") || "").trim().slice(0, 60);
  const closes = String(form.get("closes") || "");
  // A closing date means "open through the end of that day" in the receiver's timezone offset sent by the browser.
  const offset = Number(form.get("tz") || 0);
  const closesAt = /^\d{4}-\d{2}-\d{2}$/.test(closes) ? Date.parse(`${closes}T23:59:59Z`) + offset * 60_000 : null;
  const text = (k: string, max: number) => String(form.get(k) || "").trim().slice(0, max);
  const bpm = (k: string) => {
    const n = Math.round(Number(form.get(k)));
    return form.get(k) && n >= 40 && n <= 250 ? n : null;
  };
  let [lo, hi] = [bpm("bpm_min"), bpm("bpm_max")];
  if (lo && hi && lo > hi) [lo, hi] = [hi, lo];
  if (name) db().prepare("UPDATE collections SET name = ? WHERE id = ?").run(name, id);
  db()
    .prepare("UPDATE collections SET closes_at = ?, brief_wanted = ?, bpm_min = ?, bpm_max = ?, brief_note = ? WHERE id = ?")
    .run(closesAt, text("brief_wanted", 120), lo, hi, text("brief_note", 200), id);
  let genres: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("genres") || "[]"));
    if (Array.isArray(raw)) genres = [...new Set(raw.filter((g) => typeof g === "string").map(cleanGenre).filter(Boolean))].slice(0, 30);
  } catch {}
  db().prepare("UPDATE collections SET genres = ? WHERE id = ?").run(genres.length ? JSON.stringify(genres) : "", id);
  done();
}

export async function deleteCollection(id: number) {
  const u = await requireUser();
  if (!ownCollection(u.id, id)) return;
  const count = db().prepare("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?").get(u.id) as { n: number };
  if (count.n <= 1) return; // the link always needs somewhere to route
  // Tracks fall back to "unsorted" (collection_id NULL) rather than being deleted.
  db().prepare("UPDATE tracks SET collection_id = NULL WHERE collection_id = ?").run(id);
  db().prepare("DELETE FROM collections WHERE id = ?").run(id);
  if (u.active_collection_id === id) {
    const next = db().prepare("SELECT id FROM collections WHERE user_id = ? ORDER BY created_at LIMIT 1").get(u.id) as { id: number };
    db().prepare("UPDATE users SET active_collection_id = ? WHERE id = ?").run(next.id, u.id);
  }
  done();
}

/* Review decisions */

export type UndoToken = { trackId: number; prev: { decision: Decision | null; decided_at: number | null }; eventId: number };

export async function decideTrack(trackId: number, decision: Decision): Promise<UndoToken | null> {
  const u = await requireUser();
  const t = ownedTrack(u.id, trackId);
  if (!t) return null;
  const r = decide(u, t, decision);
  done();
  return { trackId, ...r };
}

/** Back to Needs review. Used when a receiver toggles off Keep or Could be better. */
export async function clearDecision(trackId: number) {
  const u = await requireUser();
  const t = ownedTrack(u.id, trackId);
  if (!t) return;
  db().prepare("UPDATE tracks SET decision = NULL, decided_at = NULL WHERE id = ?").run(t.id);
  done();
}

export async function undoDecision(token: UndoToken) {
  const u = await requireUser();
  const t = ownedTrack(u.id, token.trackId);
  if (!t) return;
  restoreDecision(u, t, token.prev, token.eventId);
  done();
}

export async function moveTrack(trackId: number, form: FormData) {
  const u = await requireUser();
  const t = ownedTrack(u.id, trackId);
  const target = ownCollection(u.id, Number(form.get("collection")));
  if (!t || !target || t.collection_id === target.id) return;
  db().prepare("UPDATE tracks SET collection_id = ? WHERE id = ?").run(target.id, t.id);
  logEvent({ user_id: u.id, sender_id: t.sender_id, track_id: t.id, type: "moved", detail: `to ${target.name}` });
  done();
}

export async function deleteTrack(trackId: number, back: string) {
  const u = await requireUser();
  const t = ownedTrack(u.id, trackId);
  if (!t) return;
  removeTrack(u, t);
  done();
  redirect(back.startsWith("/dashboard") ? back : "/dashboard");
}

/* Senders */

export async function addNote(senderId: number, trackId: number | null, form: FormData) {
  const u = await requireUser();
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  if (!body || !ownedSender(u.id, senderId)) return;
  if (trackId && !ownedTrack(u.id, trackId)) return;
  logEvent({ user_id: u.id, sender_id: senderId, track_id: trackId, type: "note", detail: body });
  done();
}

export async function replyToSender(senderId: number, trackId: number | null, form: FormData) {
  const u = await requireUser();
  const s = ownedSender(u.id, senderId);
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  if (!s || !body) return;
  await reply(u, s, trackId ? ownedTrack(u.id, trackId) : undefined, body);
  done();
}

export async function blockSender(senderId: number, blocked: boolean) {
  const u = await requireUser();
  const s = ownedSender(u.id, senderId);
  if (!s) return;
  setBlocked(u, s, blocked);
  done();
}

/* Top bar */

export async function markNotificationsRead() {
  const u = await requireUser();
  db().prepare("UPDATE users SET notifications_seen_at = ? WHERE id = ?").run(now(), u.id);
  done();
}

export type SearchHit = { kind: "track" | "contact"; id: number; title: string; detail: string; href: string };

/** Type-ahead for the search dialog: a few tracks and contacts matching the query. */
export async function quickSearch(query: string): Promise<SearchHit[]> {
  const u = await requireUser();
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const like = `%${q}%`;
  const tracks = db()
    .prepare(
      `SELECT t.id, t.title, t.artist, s.name AS sender FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.user_id = ? AND t.deleted_at IS NULL AND (t.title LIKE ? OR t.artist LIKE ?) ORDER BY t.created_at DESC LIMIT 6`,
    )
    .all(u.id, like, like) as { id: number; title: string; artist: string; sender: string }[];
  const contacts = db()
    .prepare("SELECT id, name, email FROM senders WHERE user_id = ? AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 4")
    .all(u.id, like, like) as { id: number; name: string; email: string }[];
  return [
    ...tracks.map((t) => ({ kind: "track" as const, id: t.id, title: `${t.artist} - ${t.title}`, detail: `from ${t.sender}`, href: `/dashboard?view=queue&s=all&t=${t.id}` })),
    ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, detail: c.email, href: `/dashboard/contacts/${c.id}` })),
  ];
}

/* Pause my link */

export async function pauseLink(form: FormData) {
  const u = await requireUser();
  const message = String(form.get("message") || "").trim().slice(0, 280);
  const until = String(form.get("until") || "");
  const offset = Number(form.get("tz") || 0);
  // "Until 12 Oct" means back on the morning of the 12th, receiver's local time.
  const untilAt = /^\d{4}-\d{2}-\d{2}$/.test(until) ? Date.parse(`${until}T00:00:00Z`) + offset * 60_000 : null;
  db()
    .prepare("UPDATE users SET paused_at = ?, pause_until = ?, pause_message = ? WHERE id = ?")
    .run(now(), untilAt && untilAt > now() ? untilAt : null, message, u.id);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function resumeLink() {
  const u = await requireUser();
  db().prepare("UPDATE users SET paused_at = NULL, pause_until = NULL WHERE id = ?").run(u.id);
  done();
  revalidatePath(`/${u.handle}`);
}

/* Notifications */

export async function updateNotifications(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const mode = String(form.get("notify_submissions"));
  const hour = (k: string) => {
    const v = form.get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  };
  let tz = String(form.get("tz") || "UTC");
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const quiet = form.get("quiet") === "on";
  db()
    .prepare(
      "UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, tz = ? WHERE id = ?",
    )
    .run(
      ["instant", "digest", "off"].includes(mode) ? mode : "digest",
      hour("digest_hour") ?? 9,
      quiet ? hour("quiet_start") : null,
      quiet ? hour("quiet_end") : null,
      form.get("notify_alerts") === "on" ? 1 : 0,
      tz,
      u.id,
    );
  done();
  return { ok: true };
}

/** Sends the digest immediately, whatever the schedule. Handy for checking what it looks like. */
export async function sendDigestNow(): Promise<number> {
  const u = await requireUser();
  const n = await sendDigest(u.id);
  done();
  return n;
}

/* Account */

export type SettingsState = { ok?: boolean; error?: string } | undefined;

export async function updateSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const name = String(form.get("name") || "").trim().slice(0, 80);
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  if (!name) return { error: "Name is required." };
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(handle)) return { error: "Link names use 2–30 letters, numbers, - or _." };
  if (RESERVED_HANDLES.has(handle)) return { error: "That link name is reserved." };
  if (db().prepare("SELECT 1 FROM users WHERE handle = ? AND id != ?").get(handle, u.id)) return { error: "That link is taken." };
  db().prepare("UPDATE users SET name = ?, handle = ? WHERE id = ?").run(name, handle, u.id);
  done();
  return { ok: true };
}

export async function updatePublicPage(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const style = form.get("page_style") === "stage" ? "stage" : "classic";
  const role = String(form.get("role_line") || "").trim().slice(0, 60);
  db().prepare("UPDATE users SET page_style = ?, role_line = ? WHERE id = ?").run(style, role, u.id);
  done();
  revalidatePath(`/${u.handle}`);
  return { ok: true };
}

/** Plan switch without billing, for early design partners. */
export async function setPlan(plan: string) {
  const u = await requireUser();
  if (!(plan in PLANS)) return;
  db().prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, u.id);
  done();
}
