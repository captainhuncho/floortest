import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-upload-claim-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;
delete process.env.RESEND_API_KEY;

/** A small valid 16-bit mono WAV. */
function wav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

test("the abandoned-upload clean-up leaves an upload that's being saved right now", async () => {
  const { q } = await import("../src/lib/db");
  const { purgeExpired } = await import("../src/lib/retention");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('sweep@x.io','h','Sw','sweepdesk','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const old = t - 3 * 3_600_000;
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at, claimed_at) VALUES ('up-saving', ?, 'audio/x/saving.wav', '.wav', 1, '{}', '5.5.5.5', ?, ?)", uid, old, t);
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('up-gone', ?, 'audio/x/gone.wav', '.wav', 1, '{}', '5.5.5.5', ?)", uid, old);
  await purgeExpired({ force: true });
  assert.ok(await q.get("SELECT 1 FROM uploads WHERE id = 'up-saving'"), "its save is still running");
  assert.equal(await q.get("SELECT 1 FROM uploads WHERE id = 'up-gone'"), undefined, "an abandoned one still goes");
  await q.run("DELETE FROM uploads WHERE id = 'up-saving'");
});

test("an upload completed twice at the same moment makes one track", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload } = await import("../src/lib/intake");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('own@x.io','h','Own','owndesk','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Mine', ?) RETURNING id", uid, t))!.id;
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;
  const file = wav();
  const key = `audio/${uid}/claim-test.wav`;
  await store.put(key, file, "audio/wav");
  const meta = { name: "Own", email: "own@x.io", title: "Twice", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", ownerCollectionId: col };
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('up-1', ?, ?, '.wav', ?, ?, '5.5.5.5', ?)", uid, key, file.length, JSON.stringify(meta), t);

  const analysis = { duration: 1, bpm: null, peaks: null };
  const results = await Promise.allSettled([completeUpload(receiver as never, "up-1", analysis), completeUpload(receiver as never, "up-1", analysis), completeUpload(receiver as never, "up-1", analysis)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "one completion goes through");
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => /already being saved|expired|already saved/.test(String((r as PromiseRejectedResult).reason?.message))));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND title = 'Twice'", uid), 1);
});

test("starts of one batch sent at the same moment can't pass the batch cap or skip the send limits", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { startUpload } = await import("../src/lib/intake");
  const { MAX_BATCH_TRACKS } = await import("../src/lib/plans");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('rx@x.io','h','Rx','rxdesk','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))! as never;
  const meta = (email: string, batch: string) => ({ name: "S", email, title: "T", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true, batch });

  const six = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => startUpload(receiver, meta("a@x.io", "batch-a"), 1000, `6.6.6.${i}`)));
  assert.equal(six.filter((r) => r.status === "fulfilled").length, MAX_BATCH_TRACKS, "never more than a batch holds");

  // This sender has used up today's sends to this desk: a new batch started several times at once gets nothing.
  for (let i = 0; i < 5; i++) await q.run("INSERT INTO rate_events (bucket, key, created_at) VALUES ('upload_email', ?, ?)", `${uid}:b@x.io`, t);
  const burst = await Promise.allSettled(Array.from({ length: 3 }, (_, i) => startUpload(receiver, meta("b@x.io", "batch-b"), 1000, `7.7.7.${i}`)));
  assert.equal(burst.filter((r) => r.status === "fulfilled").length, 0, "no start slips through as 'not the first'");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE meta::jsonb->>'batch' = 'batch-b'"), 0, "refused reservations are removed");
});

/** A receiver desk and one owner upload of a real WAV, ready to complete (an owner upload sends no emails). */
async function oneUpload(handle: string, uploadId: string) {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','R',?,'pro','UTC',?,?) RETURNING id", `${handle}@x.io`, handle, t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))! as never;
  const file = wav();
  const key = `audio/${uid}/${uploadId}.wav`;
  await store.put(key, file, "audio/wav");
  const meta = { name: "S", email: `${uploadId}@sender.io`, title: uploadId, artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", ownerCollectionId: col };
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,'.wav',?,?,'5.5.5.5',?)", uploadId, uid, key, file.length, JSON.stringify(meta), t);
  const row = () => q.get<{ file_key: string; claimed_at: number | null }>("SELECT file_key, claimed_at FROM uploads WHERE id = ?", uploadId);
  return { q, store, uid, receiver, row };
}

test("a dropped database connection while the track is saved keeps the sender's file, and the retry delivers it", async () => {
  const { completeUpload } = await import("../src/lib/intake");
  const { failOnce, DROPPED } = await import("./fail-once");
  const { q, store, uid, receiver, row } = await oneUpload("dropdesk", "up-drop");
  const analysis = { duration: 1, bpm: null, peaks: null };

  const restore = failOnce(q as never, /INSERT INTO tracks/);
  try {
    await assert.rejects(completeUpload(receiver, "up-drop", analysis), new RegExp(DROPPED));
  } finally {
    restore();
  }
  const kept = await row();
  assert.ok(kept, "the upload is still there");
  assert.ok(await store.head(kept.file_key), "and so is its file");
  assert.equal(kept.claimed_at, null, "the claim is let go, so the retry doesn't wait 10 minutes");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", uid), 0);

  const track = await completeUpload(receiver, "up-drop", analysis);
  assert.ok(track.file_key && (await store.head(track.file_key)), "the retry makes the track, with its file");
});

test("a failure right after sealing leaves the upload pointing at a file that exists", async () => {
  const { completeUpload } = await import("../src/lib/intake");
  const { failOnce, DROPPED } = await import("./fail-once");
  const { q, store, uid, receiver, row } = await oneUpload("sealdesk", "up-seal");
  const analysis = { duration: 1, bpm: null, peaks: null };

  const restore = failOnce(q as never, /UPDATE uploads SET file_key/);
  try {
    await assert.rejects(completeUpload(receiver, "up-seal", analysis), new RegExp(DROPPED));
  } finally {
    restore();
  }
  const kept = await row();
  assert.ok(kept, "the upload is still there");
  assert.ok(await store.head(kept.file_key), "the file it points at was not deleted");

  await completeUpload(receiver, "up-seal", analysis);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", uid), 1, "the retry delivers it");
});
