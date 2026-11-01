import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-collections-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: editing a collection runs as the person, on the desks they work only", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { ownCollection } = await import("../src/app/dashboard/actions/common");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@collections.io`, handle, handle, now, now,
    ))!.id;
  const collection = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Friday', ?) RETURNING id", desk, now))!.id;
  // The edits updateCollection makes, as the person.
  const rename = (actor: number, id: number) => asPerson(actor, () => q.run("UPDATE collections SET name = COALESCE(NULLIF(?, ''), name), brief_note = ? WHERE id = ?", "Saturday", "Afro house", id));
  const cap = (actor: number, id: number) => asPerson(actor, () => q.run("UPDATE collections SET max_tracks = ?, full_at = NULL WHERE id = ?", 50, id));
  const name = async (id: number) => (await q.get<{ name: string }>("SELECT name FROM collections WHERE id = ?", id))!.name;

  const label = await user("label");
  const efua = await user("efua"); // a member of the label's team
  const kofi = await user("kofi");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);
  const labelBox = await collection(label);
  const kofiBox = await collection(kofi);

  // A teammate edits the team desk's collection, and sees how many it has.
  assert.ok(await asPerson(efua, () => ownCollection(label, labelBox)));
  assert.equal((await rename(efua, labelBox)).changes, 1);
  assert.equal((await cap(efua, labelBox)).changes, 1);
  assert.equal(await name(labelBox), "Saturday");
  assert.equal(await asPerson(efua, () => q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", label)), 1);

  // Another desk's collection, even with the desk check fooled: not found, not counted, not changed.
  assert.equal(await asPerson(efua, () => ownCollection(kofi, kofiBox)), undefined);
  assert.equal(await asPerson(efua, () => q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", kofi)), 0);
  assert.equal((await rename(efua, kofiBox)).changes, 0);
  assert.equal((await cap(efua, kofiBox)).changes, 0);
  assert.equal(await name(kofiBox), "Friday");
});

test("collections: the app's own connection only where the person role can't do the work", () => {
  // Server actions need a signed-in request, so this checks the code path.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/collections.ts", import.meta.url), "utf8");
  const part = (from: string, to?: string) => src.slice(src.indexOf(from), to ? src.indexOf(to) : undefined);
  const update = part("export async function updateCollection", "export async function deleteCollection");
  // Every query in the edit runs as the person; the sharing switch (the app's own table) is read outside.
  assert.equal((update.match(/await q\./g) ?? []).length, 0, "no query outside asMe");
  assert.equal((update.match(/asMe\(\(\) => q\./g) ?? []).length, 4);
  assert.match(update, /const sharing = await switchOn\("sharing"\)/);
  assert.match(part("export async function setActiveCollection", "export async function updateCollection"), /asPerson\(u\.actor_id, \(\) => ownCollection\(/);
  const del = part("export async function deleteCollection");
  assert.match(del, /asPerson\(u\.actor_id, \(\) => ownCollection\(/);
  assert.match(del, /asSystem\(\(\) => removeCollection\(u\.id, id\)\)/);
});
