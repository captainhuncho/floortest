import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-stems-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;

/** A small valid 16-bit mono WAV. */
function wav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

test("stems: the receipt's request works the same after the track leaves the desk, and the files don't stay", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const S = await import("../src/lib/stems");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','R','r','pro','UTC',?,?) RETURNING id", t, t))!.id;
  await q.run("INSERT INTO feature_switches (feature, plans, users, updated_at) VALUES ('stems', '[]', ?, ?)", JSON.stringify([uid]), t);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  const track = async (token: string, deleted: number | null) =>
    q.run(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, stems_requested_at, deleted_at) VALUES (?,?,'T','A',?,'audio/x.wav','x.wav','audio/wav',1,?,?,?)",
      uid, sender, token, t, t, deleted,
    );
  await track("on-desk", null);
  await track("removed", t);

  const send = async (token: string, name: string) => {
    const { uploadId } = await S.startStemUpload(token, name, wav().length, "1.1.1.1");
    const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
    await store.put(key, wav(), "audio/wav");
    return S.completeStemUpload(token, uploadId);
  };
  const row = (token: string) => q.get<{ id: number; stems_sent: string | null }>("SELECT id, stems_sent FROM tracks WHERE token = ?", token);

  // Same answer to the sender either way; the receipt lists what they sent.
  assert.equal((await send("on-desk", "drums.wav")).name, "drums.wav");
  assert.equal((await send("removed", "drums.wav")).name, "drums.wav");
  assert.deepEqual(S.stemsSent((await row("on-desk"))!), ["drums.wav"]);
  assert.deepEqual(S.stemsSent((await row("removed"))!), ["drums.wav"]);

  // On the desk the stem is kept; on a removed track it's checked, then thrown away.
  assert.equal((await S.stemsFor((await row("on-desk"))!.id)).length, 1);
  assert.equal((await S.stemsFor((await row("removed"))!.id)).length, 0);
  assert.equal(await q.get("SELECT 1 FROM uploads"), undefined, "no upload left behind");

  // Not audio is refused the same way on both.
  for (const token of ["on-desk", "removed"]) {
    const { uploadId } = await S.startStemUpload(token, "bad.wav", 10, "1.1.1.1");
    const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
    await store.put(key, new Uint8Array(10), "audio/wav");
    await assert.rejects(S.completeStemUpload(token, uploadId), (e: Error & { status?: number }) => e.status === 415);
  }
});

test("stems: a broken or missing list reads as nothing sent", async () => {
  const { stemsSent } = await import("../src/lib/stems");
  assert.deepEqual(stemsSent({ stems_sent: null }), []);
  assert.deepEqual(stemsSent({ stems_sent: "not json" }), []);
  assert.deepEqual(stemsSent({ stems_sent: '["a.wav", 3]' }), ["a.wav"]);
});
