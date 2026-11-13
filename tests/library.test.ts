import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-library-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;
delete process.env.RESEND_API_KEY;

/** A small valid 16-bit mono WAV. */
function wav(seconds = 1) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

test("My music: own tracks are stored, kept apart from the desk, private to the desk, and deleted with their file", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const lib = await import("../src/lib/library");
  const { libraryFileAccess } = await import("../src/lib/file-access");
  const { accountKeys } = await import("../src/lib/deletion-core");
  const t = Date.now();
  await q.run("UPDATE plans SET library_limit = 1 WHERE id = 'free'");
  const make = async (handle: string) => {
    const id = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','N',?,'free','UTC',?,?) RETURNING id", `${handle}@x.io`, handle, t, t))!.id;
    const row = (await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!;
    return { ...row, actor_id: id, actor_name: "N", role: "owner" } as never as Parameters<typeof lib.startLibraryUpload>[0];
  };
  const a = await make("libowner");
  const b = await make("libother");
  const file = wav();
  const add = { fileName: "mine.wav", size: file.length, title: "My edit", artist: "Me", genre: "House", rights: true };

  await assert.rejects(lib.startLibraryUpload(a, { ...add, rights: false }), /allowed to keep/);
  const started = await lib.startLibraryUpload(a, add);
  const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", started.uploadId))!.file_key;
  assert.match(key, new RegExp(`^library/${a.id}/`));
  // The open upload counts against the allowance, so a second can't start past the limit.
  await assert.rejects(lib.startLibraryUpload(a, add), /My music is full \(1 tracks/);

  await (await storage()).put(key, file, "audio/wav");
  const none = { duration: null, bpm: null, peaks: null };
  const row = await lib.completeLibraryUpload(a, started.uploadId, none);
  assert.equal((await lib.completeLibraryUpload(a, started.uploadId, none)).id, row.id, "a retried completion answers the same row");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ?", a.id), 0, "the upload is used up");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", a.id), 0, "never a desk track (Review Queue, stats, retention)");

  // Completion seals the file under its own key (sealUpload in src/lib/storage.ts), the one the row keeps.
  const stored = (await q.get<{ file_key: string }>("SELECT file_key FROM library_tracks WHERE id = ?", row.id))!.file_key;
  assert.ok(await (await storage()).head(stored), "the file is kept");
  const mine = await lib.listLibrary(a);
  assert.deepEqual(mine.map((x) => [x.title, x.artist]), [["My edit", "Me"]]);
  assert.equal(await lib.libraryUsed(a), 1);
  assert.ok(await libraryFileAccess(a, row.id), "the desk can play it");
  assert.ok((await accountKeys(q, a.id)).includes(stored), "an account deletion removes its file too");

  // Another account sees, plays, renames and deletes none of it.
  assert.deepEqual(await lib.listLibrary(b), []);
  assert.equal(await libraryFileAccess(b, row.id), null);
  assert.ok(!(await lib.renameLibraryTrack(b, row.id, { title: "Taken", artist: "" })));
  assert.ok(!(await lib.deleteLibraryTrack(b, row.id)));

  assert.ok(await lib.renameLibraryTrack(a, row.id, { title: "Final edit", artist: "Me" }));
  assert.equal((await lib.listLibrary(a))[0].title, "Final edit");

  assert.ok(await lib.deleteLibraryTrack(a, row.id));
  assert.deepEqual(await lib.listLibrary(a), []);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM storage_deletions WHERE file_key = ?", stored), 1, "its file is queued for deletion");
});
