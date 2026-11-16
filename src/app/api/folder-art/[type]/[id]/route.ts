import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { currentDeskForChange, currentUser, viewingAs } from "@/lib/auth";
import { readCover, serveCover, settleFile, storeCover } from "@/lib/cover-art";
import { asPerson, q } from "@/lib/db";
import { discardFiles } from "@/lib/deletion";
import { recordId } from "@/lib/ids";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Cover art for a project (type "project": library_folders) or a callout or project folder (type "folder":
 * desk_folders); owner, 16 Nov. Same rules as callout art (src/lib/cover-art.ts). Found as the person (row-level
 * security), so a missing one, another desk's and the wrong type all get the same 404. Owner and admins change it;
 * anyone on the desk sees it; never public.
 */
const TABLES = { project: "library_folders", folder: "desk_folders" } as const;
type Params = { params: Promise<{ type: string; id: string }> };
const GONE = () => NextResponse.json({ error: "That isn't on your desk any more. Reload the page." }, { status: 404 });

async function find(actorId: number, deskId: number, p: Params["params"]) {
  const { type, id } = await p;
  const table = TABLES[type as keyof typeof TABLES];
  const rid = recordId(id);
  if (!table || rid === null) return null;
  const row = await asPerson(actorId, () => q.get<{ id: number; name: string; art_key: string | null }>(`SELECT id, name, art_key FROM ${table} WHERE id = ? AND user_id = ?`, rid, deskId));
  return row ? { table, row } : null;
}

/** The desk to change it on: not in a read-only "view as", not a lost team desk. */
async function changer() {
  if (await viewingAs()) return null;
  return currentDeskForChange();
}
const MEMBERS = () => NextResponse.json({ error: "Only the owner or an A&R / Admin can change covers." }, { status: 403 });

/** Upload or replace the cover (JPG, PNG or WebP, up to 8 MB, checked by its bytes). */
export async function POST(req: Request, ctx: Params) {
  const u = await changer();
  if (u instanceof Response) return u;
  if (!u) return GONE();
  if (u.role === "member") return MEMBERS();
  const found = await find(u.actor_id, u.id, ctx.params);
  if (!found) return GONE();
  if (!(await allow("cover_art", String(u.actor_id), 60, 3_600_000))) return NextResponse.json({ error: "Too many images at once. Try again shortly." }, { status: 429 });
  const opt = await readCover(req);
  if (opt instanceof Response) return opt;
  const key = await storeCover(`folder-art/${u.id}`, "folder_art", opt);
  await asPerson(u.actor_id, () => q.run(`UPDATE ${found.table} SET art_key = ? WHERE id = ? AND user_id = ?`, key, found.row.id, u.id));
  await settleFile(key);
  // The old one goes only once the new one is saved.
  await discardFiles([found.row.art_key], "cover replaced");
  await audit(u.id, "folder_updated", `${found.row.name}: cover`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Params) {
  const u = await changer();
  if (u instanceof Response) return u;
  if (!u) return GONE();
  if (u.role === "member") return MEMBERS();
  const found = await find(u.actor_id, u.id, ctx.params);
  if (!found) return GONE();
  await asPerson(u.actor_id, () => q.run(`UPDATE ${found.table} SET art_key = NULL WHERE id = ? AND user_id = ?`, found.row.id, u.id));
  await discardFiles([found.row.art_key], "cover removed");
  await audit(u.id, "folder_updated", `${found.row.name}: cover removed`);
  return NextResponse.json({ ok: true });
}

/** The cover, for anyone on the desk. The URL carries ?v=<key>, so it can be cached hard. */
export async function GET(_req: Request, ctx: Params) {
  const u = await currentUser();
  if (!u) return new Response("Not found", { status: 404 });
  const found = await find(u.actor_id, u.id, ctx.params);
  if (!found?.row.art_key) return new Response("Not found", { status: 404 });
  return serveCover(found.row.art_key);
}
