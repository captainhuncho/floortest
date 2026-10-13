import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-upload-claim-"));
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
