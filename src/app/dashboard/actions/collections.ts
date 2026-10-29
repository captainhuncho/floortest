"use server";

/** Collections: create, choose which one receives, edit and delete. */
import { redirect } from "next/navigation";
import { addCollection, canCapCallouts, routeToCollection } from "@/lib/desk";
import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { cleanGenre, MAX_COLLECTION_GENRES } from "@/lib/plans";
import { switchOn } from "@/lib/switches";
import { audit } from "@/lib/audit";
import { removeCollection } from "@/lib/deletion";
import { sendReopenAlerts } from "@/lib/reopen";
import { done, ownCollection } from "./common";

export async function createCollection(form: FormData) {
  const u = await requireUser();
  const name = String(form.get("name") || "").trim().slice(0, 60);
  if (!name) return;
  // Two collections per desk during the beta (the page hides New collection at two; addCollection holds the line, atomically).
  const id = await addCollection(u.id, name);
  if (!id) return;
  await audit(u.id, "collection_created", name);
  // "Make this the receiving one" is routing, an owner or admin power: for a member it's ignored and the collection is just added.
  if (form.get("activate") && (await routeToCollection(u, id))) {
    await audit(u.id, "collection_activated", name);
    await sendReopenAlerts(u.id, { inRequest: true });
    revalidatePath(`/${u.handle}`);
  }
  done();
}

export async function setActiveCollection(id: number) {
  const u = await requireRole("admin");
  const c = await ownCollection(u.id, id);
  if (!c) return;
  if (!(await routeToCollection(u, id))) return;
  await audit(u.id, "collection_activated", c.name);
  await sendReopenAlerts(u.id, { inRequest: true });
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
    if (Array.isArray(raw)) genres = [...new Set(raw.filter((g) => typeof g === "string").map(cleanGenre).filter(Boolean))].slice(0, MAX_COLLECTION_GENRES);
  } catch {}
  const before = (await q.get<{ closes_at: number | null; max_tracks: number | null }>("SELECT closes_at, max_tracks FROM collections WHERE id = ?", id))!;
  await q.run(
    `UPDATE collections SET name = COALESCE(NULLIF(?, ''), name), closes_at = ?, brief_wanted = ?, bpm_min = ?, bpm_max = ?, brief_note = ?, genres = ?, allow_sharing = ?
     WHERE id = ?`,
    name,
    closesAt,
    text("brief_wanted", 120),
    lo,
    hi,
    text("brief_note", 200),
    genres.length ? JSON.stringify(genres) : "",
    (await switchOn("sharing")) ? (form.get("allow_sharing") === "on" ? 1 : 0) : 0,
    id,
  );
  // What changed that decides whether the link takes tracks, named in the log (who did it shows beside it).
  const changes: string[] = [];
  if ((before.closes_at ?? null) !== closesAt) changes.push(closesAt ? `closes ${new Date(closesAt).toISOString().slice(0, 10)}` : "no close date");
  // Pro/Team track cap. Re-checked on every save: raising or clearing it reopens a full callout.
  if (canCapCallouts(u.plan)) {
    const n = Math.round(Number(form.get("max_tracks")));
    const max = form.get("max_tracks") && n >= 1 && n <= 100_000 ? n : null;
    if ((before.max_tracks ?? null) !== max) changes.push(max ? `cap ${max} tracks` : "no cap");
    const received = Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL", id))?.n ?? 0);
    await q.run("UPDATE collections SET max_tracks = ?, full_at = CASE WHEN ? THEN COALESCE(full_at, ?) ELSE NULL END WHERE id = ?", max, !!max && received >= max, now(), id);
  }
  await audit(u.id, "collection_updated", changes.length ? `${name || c.name}: ${changes.join(", ")}` : name || c.name);
  // A new closing date or a raised cap can reopen the link: senders who asked to hear about it get their email.
  if (u.active_collection_id === id) await sendReopenAlerts(u.id, { inRequest: true });
  done();
  revalidatePath(`/${u.handle}`);
}

/** Deleting a collection is confirmed by typing its name in capitals; tracks in it are kept, unsorted. */
export async function deleteCollection(id: number, confirm: string) {
  const u = await requireRole("admin");
  const c = await ownCollection(u.id, id);
  if (!c) return;
  if (confirm.trim() !== c.name.trim().toUpperCase()) return;
  if ((await q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", u.id)) <= 1) return; // the link always needs somewhere to route
  // Tracks fall back to "unsorted" (collection_id NULL) rather than being deleted; the artwork goes with it.
  await removeCollection(u.id, id);
  await audit(u.id, "collection_deleted", c.name);
  done();
  redirect("/dashboard/collections");
}
