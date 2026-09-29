"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentSessionHash, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { fmtDay } from "@/lib/format";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { hashRecovery, newRecoveryCodes, newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/totp";
import {
  activeCollection,
  capacity,
  isClosed,
  isPaused,
  userByHandle,
  clearDecision as clearTrackDecision,
  decide,
  deleteTrack as removeTrack,
  markPlayedOut,
  ownedSender,
  ownedTrack,
  reply,
  setBlocked,
  undoDecision as restoreDecision,
} from "@/lib/core";
import { isDecision, likeContains, logEvent, now, q, type Decision } from "@/lib/db";
import { sendDigest } from "@/lib/notify";
import { cleanGenre, genresFor, PLANS, planOf, RESERVED_HANDLES } from "@/lib/plans";
import { storage } from "@/lib/storage";
import { audit, trackLabel } from "@/lib/audit";
import { cleanProfileLink, IDENTITY_HOSTS, isProtectedHandle, newIdentityCode } from "@/lib/identity";

const done = () => revalidatePath("/dashboard", "layout");

/** Postgres unique-violation, e.g. two people claiming the same link name at once. */
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

function ownCollection(userId: number, id: number) {
  if (!Number.isSafeInteger(id)) return Promise.resolve(undefined);
  return q.get<{ id: number; name: string }>("SELECT id, name FROM collections WHERE id = ? AND user_id = ?", id, userId);
}

/* Collections */

export async function createCollection(form: FormData) {
  const u = await requireUser();
  const name = String(form.get("name") || "").trim().slice(0, 60);
  if (!name) return;
  const c = await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?) RETURNING id", u.id, name, now());
  if (form.get("activate")) await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", c!.id, u.id);
  await audit(u.id, "collection_created", name);
  done();
}

export async function setActiveCollection(id: number) {
  const u = await requireUser();
  const c = await ownCollection(u.id, id);
  if (!c) return;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", id, u.id);
  await audit(u.id, "collection_activated", c.name);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function updateCollection(id: number, form: FormData) {
  const u = await requireUser();
  const c = await ownCollection(u.id, id);
  if (!c) return;
  const name = String(form.get("name") || "").trim().slice(0, 60);
  const closes = String(form.get("closes") || "");
  // A closing date means "open through the end of that day" in the receiver's timezone offset sent by the browser.
  const offset = Number(form.get("tz") || 0);
  const closesAt = /^\d{4}-\d{2}-\d{2}$/.test(closes) ? Date.parse(`${closes}T23:59:59Z`) + (Number.isFinite(offset) ? offset : 0) * 60_000 : null;
  const text = (k: string, max: number) => String(form.get(k) || "").trim().slice(0, max);
  const bpm = (k: string) => {
    const n = Math.round(Number(form.get(k)));
    return form.get(k) && n >= 40 && n <= 250 ? n : null;
  };
  let [lo, hi] = [bpm("bpm_min"), bpm("bpm_max")];
  if (lo && hi && lo > hi) [lo, hi] = [hi, lo];
  let genres: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("genres") || "[]"));
    if (Array.isArray(raw)) genres = [...new Set(raw.filter((g) => typeof g === "string").map(cleanGenre).filter(Boolean))].slice(0, 30);
  } catch {}
  await q.run(
    `UPDATE collections SET name = COALESCE(NULLIF(?, ''), name), closes_at = ?, brief_wanted = ?, bpm_min = ?, bpm_max = ?, brief_note = ?, genres = ?
     WHERE id = ?`,
    name,
    closesAt,
    text("brief_wanted", 120),
    lo,
    hi,
    text("brief_note", 200),
    genres.length ? JSON.stringify(genres) : "",
    id,
  );
  await audit(u.id, "collection_updated", name || c.name);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function deleteCollection(id: number) {
  const u = await requireUser();
  const c = await ownCollection(u.id, id);
  if (!c) return;
  if ((await q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", u.id)) <= 1) return; // the link always needs somewhere to route
  await q.tx(async (db) => {
    // Tracks fall back to "unsorted" (collection_id NULL) rather than being deleted.
    await db.run("UPDATE tracks SET collection_id = NULL WHERE collection_id = ?", id);
    await db.run("DELETE FROM collections WHERE id = ?", id);
    if (u.active_collection_id === id)
      await db.run("UPDATE users SET active_collection_id = (SELECT id FROM collections WHERE user_id = ? ORDER BY created_at LIMIT 1) WHERE id = ?", u.id, u.id);
  });
  await audit(u.id, "collection_deleted", c.name);
  done();
}

/* Review decisions */

export type UndoToken = { trackId: number; prev: { decision: Decision | null; decided_at: number | null }; eventId: number };

export async function decideTrack(trackId: number, decision: Decision): Promise<UndoToken | null> {
  const u = await requireUser();
  if (!isDecision(decision)) return null;
  const t = await ownedTrack(u.id, trackId);
  if (!t) return null;
  const r = await decide(u, t, decision);
  await audit(u.id, decision, trackLabel(t), t.id);
  done();
  return { trackId, ...r };
}

/** Back to Needs review. Used when a receiver toggles off Keep or Could be better. */
export async function clearDecision(trackId: number) {
  const u = await requireUser();
  const t = await ownedTrack(u.id, trackId);
  if (!t) return;
  await clearTrackDecision(t);
  await audit(u.id, "decision_cleared", trackLabel(t), t.id);
  done();
}

export async function undoDecision(token: UndoToken) {
  const u = await requireUser();
  const t = await ownedTrack(u.id, Number(token?.trackId));
  if (!t) return;
  await restoreDecision(u, t, token.prev ?? {}, Number(token.eventId));
  await audit(u.id, "decision_undone", trackLabel(t), t.id);
  done();
}

export async function moveTrack(trackId: number, form: FormData) {
  const u = await requireUser();
  const t = await ownedTrack(u.id, trackId);
  const target = await ownCollection(u.id, Number(form.get("collection")));
  if (!t || !target || t.collection_id === target.id) return;
  await q.run("UPDATE tracks SET collection_id = ? WHERE id = ?", target.id, t.id);
  await logEvent({ user_id: u.id, sender_id: t.sender_id, track_id: t.id, type: "moved", detail: `to ${target.name}` });
  await audit(u.id, "moved", `${trackLabel(t)} to ${target.name}`, t.id);
  done();
}

export async function deleteTrack(trackId: number, back: string) {
  const u = await requireUser();
  const t = await ownedTrack(u.id, trackId);
  if (!t) return;
  await removeTrack(u, t);
  await audit(u.id, "deleted_track", trackLabel(t));
  done();
  redirect(back.startsWith("/dashboard") ? back : "/dashboard");
}

/** Starts a new Prepare for set batch. Tracks stay kept; they just leave the page. */
export async function clearKept() {
  const u = await requireUser();
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
  const t = await ownedTrack(u.id, trackId);
  if (!t || t.decision !== "kept") return false;
  const ok = await markPlayedOut(u, t, String(note || ""));
  if (ok) await audit(u.id, "played_out", trackLabel(t), t.id);
  done();
  return ok;
}

/** Beta feedback lands in the admin inbox, tagged with the page it came from. */
export async function sendFeedback(kind: string, message: string, path: string) {
  const u = await requireUser();
  const body = String(message || "").trim().slice(0, 3000);
  if (!body) return;
  const topic = ["Idea", "Bug", "Confusing", "Love it"].includes(kind) ? `Feedback · ${kind}` : "Feedback";
  await q.run(
    "INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (?,?,?,?,?,?)",
    u.id,
    u.name,
    u.email,
    topic,
    `${body}\n\nPage: ${String(path || "").slice(0, 200)}`,
    now(),
  );
}

export async function dismissOnboarding() {
  const u = await requireUser();
  await q.run("UPDATE users SET onboarding_dismissed_at = ? WHERE id = ?", now(), u.id);
  done();
}

/* Sending music from your account to another user's link */

export type ReceiverLookup =
  | { found: false; reason: string }
  | { found: true; handle: string; name: string; roleLine: string; verified: boolean; accepting: boolean; reason: string | null; genres: string[]; note: string;
      collection: string | null; brief: { k: string; v: string }[] };

/** Who is floortest.../<handle>? Used by the Send page as you type. */
export async function lookupReceiver(raw: string): Promise<ReceiverLookup> {
  const u = await requireUser();
  const handle = String(raw || "").trim().toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  if (!handle) return { found: false, reason: "" };
  if (handle === u.handle) return { found: false, reason: "That's your own link." };
  const r = await userByHandle(handle);
  if (!r) return { found: false, reason: "No one has that link." };
  const c = await activeCollection(r);
  const reason = isPaused(r) ? `${r.name} has paused submissions.` : !c ? `${r.name} isn't taking music right now.` : isClosed(c) ? `${c.name} has closed.` : (await capacity(r)).full ? `${r.name}'s desk is full right now.` : null;
  // The same brief the receiver's own link shows, so sending from the desk feels like being on their page.
  const g = genresFor(c);
  const wanted = c?.brief_wanted || (g.custom ? g.list.join(" · ") : "");
  const brief = [
    wanted && { k: "Wanted", v: wanted },
    c?.bpm_min && c?.bpm_max && { k: "Range", v: `${c.bpm_min}–${c.bpm_max} BPM` },
    c?.closes_at && { k: "Deadline", v: `Open until ${fmtDay(c.closes_at, r.tz)}` },
    c?.brief_note && { k: "Note", v: c.brief_note },
  ].filter((b): b is { k: string; v: string } => !!b);
  return {
    found: true, handle: r.handle, name: r.name, roleLine: r.role_line, verified: r.identity_status === "verified",
    accepting: !reason, reason, genres: g.list, note: isPaused(r) ? r.pause_message : "", collection: c?.name ?? null, brief,
  };
}

/* Reply templates: up to 10 saved replies per account. */

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

/* Senders */

export async function addNote(senderId: number, trackId: number | null, form: FormData) {
  const u = await requireUser();
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  const s = await ownedSender(u.id, senderId);
  if (!body || !s) return;
  if (trackId && !(await ownedTrack(u.id, trackId))) return;
  await logEvent({ user_id: u.id, sender_id: senderId, track_id: trackId, type: "note", detail: body });
  await audit(u.id, "noted", s.name, trackId);
  done();
}

export async function replyToSender(senderId: number, trackId: number | null, form: FormData) {
  const u = await requireUser();
  const s = await ownedSender(u.id, senderId);
  const body = String(form.get("body") || "").trim().slice(0, 4000);
  if (!s || !body) return;
  await reply(u, s, trackId ? await ownedTrack(u.id, trackId) : undefined, body);
  await audit(u.id, "replied", s.name, trackId);
  done();
}

export async function blockSender(senderId: number, blocked: boolean) {
  const u = await requireUser();
  const s = await ownedSender(u.id, senderId);
  if (!s) return;
  await setBlocked(u, s, !!blocked);
  await audit(u.id, blocked ? "blocked" : "unblocked", s.name);
  done();
}

/* Top bar */

export async function markNotificationsRead() {
  const u = await requireUser();
  await q.run("UPDATE users SET notifications_seen_at = ? WHERE id = ?", now(), u.id);
  done();
}

export type SearchHit = { kind: "track" | "contact"; id: number; title: string; detail: string; href: string };

/** Type-ahead for the search dialog: a few tracks and contacts matching the query. */
export async function quickSearch(query: string): Promise<SearchHit[]> {
  const u = await requireUser();
  const text = String(query ?? "").trim().slice(0, 100);
  if (!text) return [];
  const like = likeContains(text);
  const tracks = await q.all<{ id: number; title: string; artist: string; sender: string }>(
    `SELECT t.id, t.title, t.artist, s.name AS sender FROM tracks t JOIN senders s ON s.id = t.sender_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND (t.title ILIKE ? OR t.artist ILIKE ? OR t.genre ILIKE ?) ORDER BY t.created_at DESC LIMIT 6`,
    u.id,
    like,
    like,
    like,
  );
  const contacts = await q.all<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM senders WHERE user_id = ? AND (name ILIKE ? OR email ILIKE ?) ORDER BY lower(name) LIMIT 4",
    u.id,
    like,
    like,
  );
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
  const untilAt = /^\d{4}-\d{2}-\d{2}$/.test(until) ? Date.parse(`${until}T00:00:00Z`) + (Number.isFinite(offset) ? offset : 0) * 60_000 : null;
  await q.run("UPDATE users SET paused_at = ?, pause_until = ?, pause_message = ? WHERE id = ?", now(), untilAt && untilAt > now() ? untilAt : null, message, u.id);
  await audit(u.id, "link_paused", message);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function resumeLink() {
  const u = await requireUser();
  await q.run("UPDATE users SET paused_at = NULL, pause_until = NULL WHERE id = ?", u.id);
  await audit(u.id, "link_resumed");
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
  let tz = String(form.get("tz") || "UTC").slice(0, 64);
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const quiet = form.get("quiet") === "on";
  await q.run(
    "UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, tz = ? WHERE id = ?",
    ["instant", "digest", "off"].includes(mode) ? mode : "digest",
    hour("digest_hour") ?? 9,
    quiet ? hour("quiet_start") : null,
    quiet ? hour("quiet_end") : null,
    form.get("notify_alerts") === "on" ? 1 : 0,
    tz,
    u.id,
  );
  await audit(u.id, "notifications_updated");
  done();
  return { ok: true };
}

/** Sends the digest immediately, whatever the schedule. Handy for checking what it looks like. */
export async function sendDigestNow(): Promise<number> {
  const u = await requireUser();
  const n = await sendDigest(u.id);
  await audit(u.id, "digest_sent", `${n} track${n === 1 ? "" : "s"}`);
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
  if (handle !== u.handle && (await isProtectedHandle(handle))) return { error: "That name is protected for a well-known artist. If it's you, contact us." };
  try {
    await q.run("UPDATE users SET name = ?, handle = ? WHERE id = ?", name, handle, u.id);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "That link is taken." };
    throw e;
  }
  if (name !== u.name || handle !== u.handle) await audit(u.id, "settings_updated", handle !== u.handle ? `link is now /${handle}` : name);
  done();
  return { ok: true };
}

export async function updatePublicPage(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const style = form.get("page_style") === "stage" ? "stage" : "classic";
  const role = String(form.get("role_line") || "").trim().slice(0, 60);
  await q.run("UPDATE users SET page_style = ?, role_line = ? WHERE id = ?", style, role, u.id);
  await audit(u.id, "page_updated", style === "stage" ? "Stage style" : "Classic style");
  done();
  revalidatePath(`/${u.handle}`);
  return { ok: true };
}

/** Plan switch without billing, for the beta. Refuses a plan too small for what's already stored. */
export async function setPlan(plan: string) {
  const u = await requireUser();
  if (!Object.hasOwn(PLANS, plan)) return;
  const cap = await capacity(u);
  if (cap.used > planOf(plan).limit + cap.bonus) return;
  await q.run("UPDATE users SET plan = ? WHERE id = ?", plan, u.id);
  await audit(u.id, "plan_changed", planOf(plan).name);
  done();
}

/** Changes the password after checking the current one, and signs out every other device. */
export async function changePassword(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const current = String(form.get("current") || "");
  const next = String(form.get("password") || "");
  const row = await q.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id);
  if (!row || !verifyPassword(current, row.password_hash)) return { error: "Your current password isn't right." };
  if (next.length < 8 || next.length > 200) return { error: "Use at least 8 characters." };
  if (next === current) return { error: "Pick a password you haven't used here." };
  if (next.toLowerCase() === u.email.toLowerCase() || next.toLowerCase() === u.handle) return { error: "Don't use your email or link name as your password." };
  if (String(form.get("confirm") || "") !== next) return { error: "The two new passwords don't match." };
  const keep = await currentSessionHash();
  await q.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), u.id);
  await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, keep ?? "");
  await audit(u.id, "password_changed");
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "Your FloorTest password was changed",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest password was just changed and every other device was signed out.\n\nIf this wasn't you, reset your password now from the log-in page and contact us.\n\n— FloorTest`,
  });
  return { ok: true };
}

/** Ends every session except this one: lost phone, shared laptop. */
export async function signOutOtherDevices(): Promise<number> {
  const u = await requireUser();
  const keep = await currentSessionHash();
  const r = await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, keep ?? "");
  await audit(u.id, "signed_out_others", `${r.changes} device${r.changes === 1 ? "" : "s"}`);
  return r.changes;
}

/* Two-factor sign-in (authenticator app). Optional, per account. */

/** Step 1: a fresh secret, held (encrypted) but not active until a code proves the app has it. */
export async function startTwoFactor(): Promise<{ qr: string; secret: string } | null> {
  const u = await requireUser();
  if (u.totp_enabled_at) return null;
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ? AND totp_enabled_at IS NULL", sealSecret(secret, env.secret), u.id);
  const qr = await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220, color: { dark: "#10110f", light: "#f1f1eb" } });
  return { qr, secret };
}

/** Step 2: the first code turns it on. Returns recovery codes, shown once. */
export async function confirmTwoFactor(code: string): Promise<{ codes?: string[]; error?: string }> {
  const u = await requireUser();
  const row = await q.get<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ? AND totp_enabled_at IS NULL", u.id);
  if (!row?.totp_secret) return { error: "Start again: set-up expired." };
  const step = verifyTotp(openSecret(row.totp_secret, env.secret), String(code || ""), null);
  if (step == null) return { error: "That code didn't match. Check the time on your phone and try the newest code." };
  const codes = newRecoveryCodes();
  await q.run(
    "UPDATE users SET totp_enabled_at = ?, totp_last_step = ?, recovery_codes = ? WHERE id = ?",
    now(),
    step,
    JSON.stringify(codes.map(hashRecovery)),
    u.id,
  );
  await audit(u.id, "two_factor_on");
  done();
  return { codes };
}

/** Turning it off needs the password and a current code (or a recovery code). */
export async function disableTwoFactor(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const row = await q.get<{ password_hash: string; totp_secret: string | null; totp_last_step: number | null; recovery_codes: string }>(
    "SELECT password_hash, totp_secret, totp_last_step, recovery_codes FROM users WHERE id = ?",
    u.id,
  );
  if (!row || !verifyPassword(String(form.get("password") || ""), row.password_hash)) return { error: "Your password isn't right." };
  const code = String(form.get("code") || "");
  const ok =
    (row.totp_secret && verifyTotp(openSecret(row.totp_secret, env.secret), code, row.totp_last_step) != null) ||
    (JSON.parse(row.recovery_codes || "[]") as string[]).includes(hashRecovery(code));
  if (!ok) return { error: "That code didn't work." };
  await q.run("UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?", u.id);
  await audit(u.id, "two_factor_off");
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "Two-factor sign-in was turned off",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nTwo-factor sign-in was just turned off for your FloorTest account.\n\nIf this wasn't you, reset your password now and turn it back on in Settings.\n\n— FloorTest`,
  });
  done();
  return { ok: true };
}

export async function setSigninAlerts(on: boolean) {
  const u = await requireUser();
  await q.run("UPDATE users SET signin_alerts = ? WHERE id = ?", on ? 1 : 0, u.id);
  await audit(u.id, on ? "signin_alerts_on" : "signin_alerts_off");
  done();
}

/* Identity verification: prove you're the real artist, get a Verified badge. */

/** Gives the account its bio code (created once, reused so it doesn't change under them). */
export async function identityCode(): Promise<string> {
  const u = await requireUser();
  const row = await q.get<{ c: string | null }>("SELECT identity_code AS c FROM users WHERE id = ?", u.id);
  if (row?.c) return row.c;
  const code = newIdentityCode();
  await q.run("UPDATE users SET identity_code = COALESCE(identity_code, ?) WHERE id = ?", code, u.id);
  return (await q.get<{ c: string }>("SELECT identity_code AS c FROM users WHERE id = ?", u.id))!.c;
}

export async function submitIdentity(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  if (u.identity_status === "verified") return { ok: true };
  const links = [...new Set(form.getAll("link").map((l) => cleanProfileLink(String(l))).filter((l): l is string => !!l))].slice(0, 5);
  if (!links.length) return { error: "Add at least one profile link." };
  const bad = links.find((l) => !IDENTITY_HOSTS.some((h) => new URL(l).host === h || new URL(l).host.endsWith(`.${h}`)));
  if (bad) return { error: `${new URL(bad).host} isn't one we can check. Use Instagram, SoundCloud, Resident Advisor, Spotify, Bandcamp, Mixcloud, TikTok, X, YouTube or Beatport.` };
  await identityCode();
  await q.run(
    "UPDATE users SET identity_status = 'pending', identity_links = ?, identity_note = '', identity_submitted_at = ? WHERE id = ?",
    JSON.stringify(links),
    now(),
    u.id,
  );
  await audit(u.id, "identity_submitted", links.map((l) => new URL(l).host).join(", "));
  done();
  return { ok: true };
}

/** Permanently deletes the account, every stored file, and all history. Requires the password. */
export async function deleteAccount(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const row = await q.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id);
  if (!row || !verifyPassword(String(form.get("password") || ""), row.password_hash)) return { error: "That password isn't right." };
  const store = await storage();
  const keys = await q.all<{ k: string }>(
    "SELECT file_key AS k FROM tracks WHERE user_id = ? AND file_key IS NOT NULL UNION SELECT file_key FROM uploads WHERE receiver_id = ?",
    u.id,
    u.id,
  );
  for (const { k } of keys) await store.delete(k).catch(() => {});
  if (u.cover_key) await store.delete(u.cover_key).catch(() => {});
  await destroySession();
  await q.run("DELETE FROM users WHERE id = ?", u.id); // cascades to everything the account owns
  redirect("/?deleted=1");
}
