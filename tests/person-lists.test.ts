import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-lists-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: the desk lists read as the person show only desks they work", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { loadRows, LIST_COLUMNS } = await import("../src/app/dashboard/rows");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@lists.io`, handle, handle, now, now,
    ))!.id;
  const track = async (desk: number, decision: string | null = null) => {
    const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}-${Math.random()}@send.io`, now))!.id;
    return (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at, decision, decided_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?, ?, ?) RETURNING id",
      desk, sender, `tok-${desk}-${Math.random()}`, now, decision, decision ? now : null,
    ))!.id;
  };
  // The Review Queue's list read, joins included (senders, collections, folders).
  const queue = (actor: number, desk: number) =>
    asPerson(actor, () =>
      q.all<{ id: number }>(
        `SELECT ${LIST_COLUMNS}, s.name AS sender_name, c.name AS collection_name, r.title AS release_title
           FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
           LEFT JOIN releases r ON r.id = t.release_id AND r.user_id = t.user_id
          WHERE t.user_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at ASC LIMIT 500`,
        desk,
      ),
    );

  const label = await user("label");
  const efua = await user("efua"); // a member of the label's team
  const kofi = await user("kofi");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);
  const labelTrack = await track(label, "kept");
  await track(kofi, "kept");

  // A teammate reads the team desk's lists.
  assert.deepEqual((await queue(efua, label)).map((r) => r.id), [labelTrack]);
  assert.deepEqual((await loadRows(label, { inSet: true, actor: efua })).map((r) => r.id), [labelTrack]);

  // Another desk, even with the desk filter fooled: nothing comes back.
  assert.deepEqual(await queue(efua, kofi), []);
  assert.deepEqual(await loadRows(kofi, { inSet: true, actor: efua }), []);
  // The desk's owner reads their own list, as the app and the phone's offline sync do.
  assert.equal((await loadRows(kofi, { inSet: true, actor: kofi })).length, 1);
});

test("the desk list pages read through the person scope", () => {
  // Pages need a signed-in request, so this checks the code path: no track query left outside asMe / actor.
  const read = (p: string) => fs.readFileSync(new URL(`../src/app/dashboard/${p}`, import.meta.url), "utf8");
  for (const [file, n] of [["review/page.tsx", 3], ["list/SubmissionsList.tsx", 3], ["collections/[id]/page.tsx", 2]] as const) {
    const src = read(file);
    assert.equal((src.match(/asMe\(\(\) =>/g) ?? []).length, n, file);
    assert.doesNotMatch(src, /await q\.(all|get|count)/, `${file}: a query outside the person scope`);
  }
  assert.match(read("prepare/page.tsx"), /loadRows\(user\.id, \{ inSet: true, actor: user\.actor_id \}\)/);
});

test("the app and offline lists read through the person scope", () => {
  const read = (p: string) => fs.readFileSync(new URL(`../src/app/api/${p}`, import.meta.url), "utf8");
  for (const file of ["v1/prepare/route.ts", "offline/list/route.ts"]) {
    assert.match(read(file), /loadRows\(u\.id, \{ inSet: true, actor: u\.actor_id \}\)/, file);
  }
  const one = read("v1/collections/[id]/route.ts");
  assert.match(one, /asPerson\(u\.actor_id, \(\) => q\.get/);
  assert.match(one, /loadRows\(u\.id, \{ collectionId: c\.id, actor: u\.actor_id \}\)/);
  assert.doesNotMatch(one, /await q\./, "a query outside the person scope");
});
