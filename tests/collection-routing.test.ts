import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-collection-routing-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Which collection the link routes new tracks to is an owner or admin power. createCollection is open to members
// (and can be called without the button), so its "make this the receiving one" box must not move routing for them.
test("a member's new collection never becomes the receiving one; an owner's or admin's does", async () => {
  const { q } = await import("../src/lib/db");
  const { routeToCollection } = await import("../src/lib/desk");
  const t = Date.now();
  const label = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('route@team.io', 'h', 'Route', 'routelabel', 'pro', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  const collection = async (name: string) => (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?) RETURNING id", label, name, t))!.id;
  const receiving = async () => (await q.get<{ active_collection_id: number | null }>("SELECT active_collection_id FROM users WHERE id = ?", label))!.active_collection_id;
  const desk = (role: "owner" | "admin" | "member") => ({ id: label, role });

  const first = await collection("First");
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", first, label);

  const byMember = await collection("Member made");
  assert.equal(await routeToCollection(desk("member"), byMember), false, "refused for a member");
  assert.equal(await receiving(), first, "the link still routes to the same collection");

  const byAdmin = await collection("Admin made");
  assert.equal(await routeToCollection(desk("admin"), byAdmin), true);
  assert.equal(await receiving(), byAdmin);

  assert.equal(await routeToCollection(desk("owner"), first), true);
  assert.equal(await receiving(), first);

  // Only the desk's own collections: another desk's id changes nothing.
  const other = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('other@team.io', 'h', 'Other', 'routeother', 'free', 'UTC', ?) RETURNING id",
    t,
  ))!.id;
  const theirs = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Theirs', ?) RETURNING id", other, t))!.id;
  assert.equal(await routeToCollection(desk("owner"), theirs), false);
  assert.equal(await receiving(), first);
});

test("createCollection routes the new collection only through the role-checked helper", () => {
  // Server actions need a signed-in request, so this checks the code path: no direct write of active_collection_id.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/collections.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function createCollection")).split("\nexport ")[0];
  assert.doesNotMatch(body, /active_collection_id/, "no unchecked routing change");
  assert.match(body, /routeToCollection\(u, /, "routing goes through the role check");
});
