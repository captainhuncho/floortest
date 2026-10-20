import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and file storage for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-track-art-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.STORAGE_DRIVER;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);

async function track(token: string) {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  await q.run("UPDATE plans SET track_art = 1 WHERE id = 'team'");
  const owner =
    (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'art'"))?.id ??
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('art@x.io', 'h', 'Art', 'art', 'team', 'UTC', ?, ?) RETURNING id",
      t, t,
    ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", owner, `${token}@x.io`, t))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A',?,'audio/a.wav','a.wav','audio/wav',1,?) RETURNING id",
    owner, sender, token, t,
  ))!.id;
  const { attachTrackArt } = await import("../src/lib/track-art");
  const call = (body: object) => attachTrackArt(token, body);
  const artKey = async () => (await q.get<{ art_key: string | null }>("SELECT art_key FROM tracks WHERE id = ?", id))!.art_key;
  const pending = async () => (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE meta::jsonb->>'kind' = 'track_art' AND (meta::jsonb->>'trackId')::bigint = ?", id))?.file_key;
  return { call, artKey, pending };
}

test("artwork is checked on a sealed copy: writing to the upload link afterwards changes nothing", async () => {
  const { storage } = await import("../src/lib/storage");
  const store = await storage();
  const { call, artKey, pending } = await track("tok-art");

  assert.equal((await call({ type: "image/png", size: PNG.length })).status, 200);
  const staging = (await pending())!;
  assert.ok(staging, "the upload is recorded, so an abandoned one is cleaned up with the others");
  assert.equal(await artKey(), null, "nothing is the artwork until it's checked");

  await store.put(staging, PNG, "image/png");
  assert.equal((await call({ done: true })).status, 200);
  const art = (await artKey())!;
  assert.ok(art && art !== staging, "the artwork is a sealed copy, not the file the upload link points at");
  assert.equal(await pending(), undefined, "the upload record is gone");

  // The sender's upload link may still be valid: writing to it again can't touch the sealed artwork.
  await store.put(staging, new Uint8Array([1, 2, 3]), "image/png");
  assert.deepEqual([...(await store.read(art, 0, 3))], [0x89, 0x50, 0x4e, 0x47], "still the checked PNG");
  assert.equal((await call({ type: "image/png", size: PNG.length })).status, 409, "only the first artwork sticks");
});

test("a file that isn't the declared image is refused and leaves nothing behind", async () => {
  const { storage } = await import("../src/lib/storage");
  const { call, artKey, pending } = await track("tok-art2");
  await call({ type: "image/png", size: 20 });
  await (await storage()).put((await pending())!, new Uint8Array(20).fill(7), "image/png");
  assert.equal((await call({ done: true })).status, 415);
  assert.equal(await artKey(), null);
  assert.equal(await pending(), undefined);
});
