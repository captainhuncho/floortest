import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-release-scope-"));
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

async function desk(handle: string) {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','R',?,'pro','UTC',?,?) RETURNING id", `${handle}@x.io`, handle, t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  return { uid, receiver: (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))! as never };
}

const meta = (email: string, group: { release?: { id: string; title: string; artist: string; kind: "ep" | "album" }; batch?: string }) => ({
  name: "S", email, title: "T", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true, ...group,
});

test("two desks given the same release id each get their own release row", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { startUpload, completeUpload } = await import("../src/lib/intake");
  const store = await storage();
  const shared = "same-release-id-0001";
  const send = async (d: Awaited<ReturnType<typeof desk>>, email: string, title: string) => {
    const { uploadId } = await startUpload(d.receiver, meta(email, { release: { id: shared, title, artist: "A", kind: "ep" } }), wav().length, "8.8.8.8");
    const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
    await store.put(key, wav(), "audio/wav");
    // completeUpload ends with Next's after() (follow-up emails), which needs a real request; the track is saved before it.
    await completeUpload(d.receiver, uploadId, { duration: 1, bpm: null, peaks: null }).catch((e: Error) => assert.match(e.message, /outside a request scope/));
  };
  const a = await desk("reldeska");
  const b = await desk("reldeskb");
  await send(a, "first@x.io", "Desk A's EP");
  await send(b, "second@x.io", "Desk B's EP");
  const rows = await q.all<{ user_id: number; title: string }>(
    "SELECT t.user_id, r.title FROM tracks t JOIN releases r ON r.id = t.release_id WHERE t.user_id IN (?, ?) ORDER BY t.user_id",
    a.uid, b.uid,
  );
  assert.deepEqual(rows, [{ user_id: a.uid, title: "Desk A's EP" }, { user_id: b.uid, title: "Desk B's EP" }]);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks t JOIN releases r ON r.id = t.release_id WHERE r.user_id <> t.user_id"), 0);
});

test("only the sender who started a release or batch can add to it, even before its first track is saved", async () => {
  const { startUpload } = await import("../src/lib/intake");
  const d = await desk("reldeskc");
  const release = { id: "open-release-id-0001", title: "EP", artist: "A", kind: "ep" as const };
  await startUpload(d.receiver, meta("owner@x.io", { release }), 1000, "9.9.9.1");
  await assert.rejects(startUpload(d.receiver, meta("intruder@x.io", { release }), 1000, "9.9.9.2"), /belongs to someone else/);
  await startUpload(d.receiver, meta("owner@x.io", { release }), 1000, "9.9.9.1");

  await startUpload(d.receiver, meta("owner@x.io", { batch: "open-batch-id-00001" }), 1000, "9.9.9.1");
  await assert.rejects(startUpload(d.receiver, meta("intruder@x.io", { batch: "open-batch-id-00001" }), 1000, "9.9.9.2"), /belongs to someone else/);
});
