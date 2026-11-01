import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-move-delete-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: a batch move runs as the person and can't reach another desk", async () => {
  const { q, asPerson, logEvents } = await import("../src/lib/db");
  const { ownCollection } = await import("../src/app/dashboard/actions/common");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id",
      `${handle}@move.io`, handle, handle, now, now,
    ))!.id;
  const collection = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Friday', ?) RETURNING id", desk, now))!.id;
  const track = async (desk: number) => {
    const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}-${Math.random()}@send.io`, now))!.id;
    return (await q.get<{ id: number; sender_id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id, sender_id",
      desk, sender, `tok-${desk}-${Math.random()}`, now,
    ))!;
  };
  // The batch move as batchTracks runs it: one update and one activity insert, in a transaction, as the person.
  const move = (actor: number, desk: number, to: number, ts: { id: number; sender_id: number }[]) =>
    asPerson(actor, () =>
      q.tx(async (db) => {
        const r = await db.run(`UPDATE tracks SET collection_id = ? WHERE user_id = ? AND id IN (${ts.map(() => "?").join(",")})`, to, desk, ...ts.map((t) => t.id));
        await logEvents(ts.map((t) => ({ user_id: desk, actor_id: actor, sender_id: t.sender_id, track_id: t.id, type: "moved", detail: "to Friday" })), db);
        return r.changes;
      }),
    );
  const inCollection = (id: number) => q.count("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ?", id);

  const ama = await user("ama");
  const kofi = await user("kofi");
  const amaBox = await collection(ama);
  const kofiBox = await collection(kofi);
  const amaTracks = [await track(ama), await track(ama)];
  const kofiTracks = [await track(kofi)];

  // Own desk: the collection is found and both tracks move, with their log entries.
  assert.ok(await asPerson(ama, () => ownCollection(ama, amaBox)));
  assert.equal(await move(ama, ama, amaBox, amaTracks), 2);
  assert.equal(await inCollection(amaBox), 2);

  // Another desk's collection isn't found, and its tracks can't be moved or logged, even with the desk check fooled.
  assert.equal(await asPerson(ama, () => ownCollection(kofi, kofiBox)), undefined);
  await assert.rejects(move(ama, kofi, kofiBox, kofiTracks), /row-level security/);
  assert.equal(await inCollection(kofiBox), 0);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM events WHERE user_id = ?", kofi), 0);
});

test("delete runs as the app only on tracks the person lookup confirmed", () => {
  // Server actions need a signed-in request, so this checks the code path: the lookup as the person, then the
  // delete (which retires files through tables the person role can't reach) through asSystem on purpose.
  const batch = fs.readFileSync(new URL("../src/app/dashboard/actions/batch.ts", import.meta.url), "utf8");
  assert.match(batch, /const tracks = await asPerson\(u\.actor_id/);
  assert.match(batch, /await asSystem\(\(\) => deleteTracks\(u, tracks\)\)/);
  const review = fs.readFileSync(new URL("../src/app/dashboard/actions/review.ts", import.meta.url), "utf8");
  const single = review.slice(review.indexOf("export async function deleteTrack"), review.indexOf("export async function clearKept"));
  assert.match(single, /ownedTrack\(u, trackId\)/);
  assert.match(single, /asSystem\(\(\) => removeTrack\(u, t\)\)/);
});
