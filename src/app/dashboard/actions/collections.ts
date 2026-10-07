"use server";

/** Collections: create, choose which one receives, edit and delete. */
import { canCapCallouts } from "@/lib/desk";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { cleanGenre, MAX_COLLECTION_GENRES } from "@/lib/plans";
import { switchOn } from "@/lib/switches";
import { audit } from "@/lib/audit";
import { done, ownCollection } from "./common";

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
    if (Array.isArray(raw)) genres = [...new Set(raw.filter((g) => typeof g === "string").map(cleanGenre).filter(Boolean))].slice(0, MAX_COLLECTION_GENRES);
  } catch {}
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
  // Pro/Team track cap. Re-checked on every save: raising or clearing it reopens a full callout.
  if (canCapCallouts(u.plan)) {
    const n = Math.round(Number(form.get("max_tracks")));
    const max = form.get("max_tracks") && n >= 1 && n <= 100_000 ? n : null;
    const received = Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL", id))?.n ?? 0);
    await q.run("UPDATE collections SET max_tracks = ?, full_at = CASE WHEN ? THEN COALESCE(full_at, ?) ELSE NULL END WHERE id = ?", max, !!max && received >= max, now(), id);
  }
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
