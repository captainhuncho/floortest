"use server";

/** Around the desk: feedback, onboarding, the Send page lookup, notifications, search and pausing the link. */
import { readLinks, type ProfileLink } from "@/lib/socials";
import { revalidatePath } from "next/cache";
import { folderLimit, trackArtEnabled } from "@/lib/plan-store";
import { requireUser } from "@/lib/auth";
import { fmtDay } from "@/lib/format";
import { activeCollection, capacity, isClosed, isPaused, userByHandle } from "@/lib/desk";
import { likeContains, now, q } from "@/lib/db";
import { genresFor } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { listeners } from "@/lib/team";
import { done } from "./common";

/** Beta feedback lands in the admin inbox, tagged with the page it came from. */
export async function sendFeedback(kind: string, message: string, path: string) {
  const u = await requireUser();
  const body = String(message || "").trim().slice(0, 3000);
  if (!body) return;
  const topic = ["Idea", "Bug", "Confusing", "Love it"].includes(kind) ? `Feedback · ${kind}` : "Feedback";
  await q.run(
    "INSERT INTO contact_messages (user_id, name, email, topic, message, page, created_at) VALUES (?,?,?,?,?,?,?)",
    u.id,
    u.name,
    u.email,
    topic,
    body,
    String(path || "").slice(0, 200),
    now(),
  );
}

export async function dismissOnboarding() {
  const u = await requireUser();
  await q.run("UPDATE users SET onboarding_dismissed_at = ? WHERE id = ?", now(), u.id);
  done();
}

export type ReceiverLookup =
  | { found: false; reason: string }
  | { found: true; handle: string; name: string; roleLine: string; verified: boolean; accepting: boolean; reason: string | null; genres: string[]; note: string;
      collection: string | null; brief: { k: string; v: string }[]; folderBytes: number; trackArt: boolean; photo: string | null; links: ProfileLink[] };

/** Who is floortest.../<handle>? Used by the Send page as you type. */
export async function lookupReceiver(raw: string): Promise<ReceiverLookup> {
  const u = await requireUser();
  const handle = String(raw || "").trim().toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  if (!handle) return { found: false, reason: "" };
  if (handle === u.handle) return { found: false, reason: "That's your own link." };
  const r = await userByHandle(handle);
  if (!r) return { found: false, reason: "No one has that link." };
  const c = await activeCollection(r);
  const reason = isPaused(r) ? `${r.name} has paused submissions.` : !c ? `${r.name} isn't taking music right now.` : isClosed(c) ? (c?.full_at ? `${c.name} is full.` : `${c.name} has closed.`) : (await capacity(r)).full ? `${r.name}'s desk is full right now.` : null;
  // The same brief the receiver's own link shows, so sending from the desk feels like being on their page.
  const g = genresFor(c);
  const wanted = c?.brief_wanted || (g.custom ? g.list.join(" · ") : "");
  const team = await listeners(c);
  const brief = [
    wanted && { k: "Wanted", v: wanted },
    c?.bpm_min && c?.bpm_max && { k: "Range", v: `${c.bpm_min}–${c.bpm_max} BPM` },
    c?.closes_at && { k: "Deadline", v: `Open until ${fmtDay(c.closes_at, r.tz)}` },
    c?.brief_note && { k: "Note", v: c.brief_note },
    team.length > 0 && { k: "Team", v: `Also heard by ${team.map((m) => m.name).join(", ")}` },
  ].filter((b): b is { k: string; v: string } => !!b);
  return {
    found: true, handle: r.handle, name: r.name, roleLine: r.role_line, verified: r.identity_status === "verified",
    accepting: !reason, reason, genres: g.list, note: isPaused(r) ? r.pause_message : "", collection: c?.name ?? null, brief,
    folderBytes: await folderLimit(r.plan),
    trackArt: await trackArtEnabled(r.plan),
    photo: r.cover_key ? `/api/cover/${r.handle}?v=${encodeURIComponent(r.cover_key)}` : null,
    links: readLinks(r.links),
  };
}

/** "Clear all": the bell starts empty again. Live alerts (desk full, paused) stay while they're true. */
export async function clearNotifications() {
  const u = await requireUser();
  await q.run("UPDATE users SET notifications_cleared_at = ?, notifications_seen_at = ? WHERE id = ?", now(), now(), u.id);
  done();
}

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
    ...tracks.map((t) => ({ kind: "track" as const, id: t.id, title: `${t.artist} - ${t.title}`, detail: `from ${t.sender}`, href: `/dashboard/review?view=queue&s=all&t=${t.id}` })),
    ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, detail: c.email, href: `/dashboard/contacts/${c.id}` })),
  ];
}

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
