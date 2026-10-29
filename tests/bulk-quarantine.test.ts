import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-bulk-quarantine-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const setup = async (handle: string) => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const desk = (await q.get<{ id: number; plan: string }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','B',?,'pro','UTC',?,?) RETURNING id, plan",
    `${handle}@x.io`, handle, t, t,
  ))!;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", desk.id, t))!.id;
  const track = async (token: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at) VALUES (?,?,'T','A',?,?,'a.wav','audio/wav',1,?,'kept',?) RETURNING id",
      desk.id, sender, `${handle}-${token}`, `audio/${handle}/${token}.wav`, t, t,
    ))!.id;
  const hold = (key: string, status = "mismatch") =>
    q.run("INSERT INTO file_digests (file_key, sha256, size, checked_at, status) VALUES (?, '', 0, ?, ?)", key, t, status);
  return { q, desk, track, hold, key: (token: string) => `audio/${handle}/${token}.wav` };
};

test("a held track is left out of the crate download, so it is never streamed or marked Downloaded", async () => {
  const { desk, track, hold, key } = await setup("crate");
  const { crateTracks } = await import("../src/lib/crate");
  const good = await track("good");
  const held = await track("held");
  const gone = await track("gone");
  await hold(key("held"));
  await hold(key("gone"), "missing");
  await hold(key("good"), "ok");

  const kept = await crateTracks(desk.id, {});
  assert.deepEqual(kept.map((x) => x.id), [good], "kept tracks: only the checked one");
  const picked = await crateTracks(desk.id, { ids: [good, held, gone] });
  assert.deepEqual(picked.map((x) => x.id), [good], "a selection by id: the held ones are skipped");
  assert.deepEqual(await crateTracks(desk.id, { ids: [held] }), [], "nothing left: the route answers 'None of those tracks can be downloaded'");
});

test("a held stem is left out of the stems ZIP, and a track with only held stems has no ZIP", async () => {
  const { q, desk, track, hold } = await setup("stemzip");
  const { fileAccess } = await import("../src/lib/file-access");
  await q.run("INSERT INTO feature_switches (feature, plans, users, updated_at) VALUES ('stems', '[]', ?, ?)", JSON.stringify([desk.id]), Date.now());
  const stem = (trackId: number, key: string, name: string) =>
    q.run("INSERT INTO stems (track_id, file_key, name, mime, size, created_at) VALUES (?, ?, ?, 'audio/wav', 1, ?)", trackId, key, name, Date.now());
  const mixed = await track("mixed");
  await stem(mixed, "stems/kick.wav", "Kick.wav");
  await stem(mixed, "stems/bass.wav", "Bass.wav");
  await hold("stems/bass.wav");
  const allHeld = await track("all-held");
  await stem(allHeld, "stems/vox.wav", "Vox.wav");
  await hold("stems/vox.wav", "missing");

  const grant = await fileAccess(desk, "stems", mixed);
  assert.deepEqual(grant?.stems?.map((s) => s.file_key), ["stems/kick.wav"], "only the checked stem goes in the ZIP");
  assert.equal(await fileAccess(desk, "stems", allHeld), null, "every stem held: not found");
});
