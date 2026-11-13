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

test("Projects: own tracks are stored, kept apart from the desk, private to the desk, and deleted with their file", async () => {
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
  await assert.rejects(lib.startLibraryUpload(a, add), /Projects are full \(1 tracks/);

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

test("Projects: projects (folders) and moves stay inside the desk; only the desk's own collection tracks move in", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const lib = await import("../src/lib/library");
  const { completeUpload } = await import("../src/lib/intake");
  const t = Date.now();
  await q.run("UPDATE plans SET library_limit = 10 WHERE id = 'free'");
  const make = async (handle: string) => {
    const id = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','N',?,'free','UTC',?,?) RETURNING id", `${handle}@x.io`, handle, t, t))!.id;
    const row = (await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!;
    return { ...row, actor_id: id, actor_name: "N", role: "owner" } as never as Parameters<typeof lib.moveTrackToProjects>[0];
  };
  const a = await make("foldowner");
  const b = await make("foldother");
  const none = { duration: null, bpm: null, peaks: null };
  const file = wav();
  const add = { fileName: "mine.wav", size: file.length, title: "Demo", artist: "Me", genre: "House", rights: true };

  // Projects: named, renamed, and invisible to another account.
  await assert.rejects(lib.createFolder(a, "   "), /name/);
  const ep = await lib.createFolder(a, "  Summer   EP ");
  assert.equal((await lib.getFolder(a, ep))!.name, "Summer EP");
  const theirs = await lib.createFolder(b, "Theirs");
  assert.equal(await lib.getFolder(b, ep), null);
  assert.ok(!(await lib.renameFolder(b, ep, "Taken")));
  assert.ok(!(await lib.deleteFolder(b, ep)));
  assert.ok(await lib.renameFolder(a, ep, "Winter EP"));
  await assert.rejects(lib.startLibraryUpload(a, { ...add, folderId: theirs }), /isn't there/, "never into another account's project");

  // An upload lands in the project it was added to.
  const started = await lib.startLibraryUpload(a, { ...add, folderId: ep });
  const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", started.uploadId))!.file_key;
  await (await storage()).put(key, file, "audio/wav");
  // The sender completion never finishes a Projects upload as a desk track; the upload stays open for its own.
  await assert.rejects(completeUpload(a, started.uploadId, none), (e: { status?: number }) => e.status === 410);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", a.id), 0);
  const row = await lib.completeLibraryUpload(a, started.uploadId, none);
  assert.deepEqual((await lib.listLibrary(a, ep)).map((x) => x.id), [row.id]);
  assert.deepEqual(await lib.listLibrary(a, null), []);
  assert.equal((await lib.getFolder(a, ep))!.count, 1);

  // Moved between projects and out of any; never into or by another account.
  const live = await lib.createFolder(a, "Live set");
  assert.ok(await lib.moveLibraryTrack(a, row.id, live));
  assert.deepEqual((await lib.listLibrary(a, live)).map((x) => x.id), [row.id]);
  assert.ok(!(await lib.moveLibraryTrack(a, row.id, theirs)));
  assert.ok(!(await lib.moveLibraryTrack(b, row.id, null)));
  assert.ok(await lib.moveLibraryTrack(a, row.id, null));
  assert.deepEqual((await lib.listLibrary(a, null)).map((x) => x.id), [row.id]);
  // Deleting a project keeps its tracks, in no project.
  assert.ok(await lib.moveLibraryTrack(a, row.id, live));
  assert.ok(await lib.deleteFolder(a, live));
  assert.deepEqual((await lib.listLibrary(a, null)).map((x) => x.id), [row.id]);

  // From a collection: a track the desk added itself moves, keeping its file; a sender's never does.
  const own = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, account_id, created_at) VALUES (?, 'foldowner@x.io', 'Me', ?, ?) RETURNING id", a.id, a.id, t))!.id;
  const stranger = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@send.io', 'S', ?) RETURNING id", a.id, t))!.id;
  const track = async (sender: number, k: string) => {
    await (await storage()).put(k, file, "audio/wav");
    return (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'Mine','Me',?,?,'m.wav','audio/wav',?,?) RETURNING id",
      a.id,
      sender,
      `tok-${k}`,
      k,
      file.length,
      t,
    ))!.id;
  };
  const mineId = await track(own, `audio/${a.id}/own.wav`);
  const sentId = await track(stranger, `audio/${a.id}/sent.wav`);

  const refused = await lib.moveTrackToProjects(a, sentId, null);
  assert.ok(!refused.ok && /added yourself/.test(refused.error), "a sender's track stays under the data rules");
  const notTheirs = await lib.moveTrackToProjects(b, mineId, null);
  assert.ok(!notTheirs.ok, "another account can't move it");
  // Two users: never into another desk's project, by the app or straight in the database (0142's same-desk key).
  const intoTheirs = await lib.moveTrackToProjects(a, mineId, theirs);
  assert.ok(!intoTheirs.ok && /isn't there/.test(intoTheirs.error), "never into another account's project");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM library_tracks WHERE folder_id = ?", theirs), 0);
  assert.equal((await q.get<{ deleted_at: number | null }>("SELECT deleted_at FROM tracks WHERE id = ?", mineId))!.deleted_at, null, "the track stays put");
  await assert.rejects(q.run("UPDATE library_tracks SET folder_id = ? WHERE id = ?", theirs, row.id), /foreign key|violates/);

  const moved = await lib.moveTrackToProjects(a, mineId, ep);
  assert.ok(moved.ok);
  const kept = (await q.get<{ file_key: string; folder_id: number }>("SELECT file_key, folder_id FROM library_tracks WHERE id = ?", moved.id))!;
  assert.deepEqual([kept.file_key, Number(kept.folder_id)], [`audio/${a.id}/own.wav`, ep]);
  assert.ok(await (await storage()).head(kept.file_key), "the audio file is kept");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM storage_deletions WHERE file_key = ?", kept.file_key), 0, "never queued for deletion");
  const retired = (await q.get<{ deleted_at: number | null; file_key: string | null }>("SELECT deleted_at, file_key FROM tracks WHERE id = ?", mineId))!;
  assert.ok(retired.deleted_at && retired.file_key === null, "the collection track is retired");
  const again = await lib.moveTrackToProjects(a, mineId, null);
  assert.ok(!again.ok, "a second tap moves nothing");
});

test("Projects 1b: Move all moves only the desk's own uploads, stops when Projects are full, and leaves senders' tracks", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const lib = await import("../src/lib/library");
  const t = Date.now();
  const id = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('allmove@x.io','h','N','allmove','free','UTC',?,?) RETURNING id", t, t))!.id;
  const desk = { ...(await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!, actor_id: id, actor_name: "N", role: "owner" } as never as Parameters<typeof lib.moveAllOwnToProjects>[0];
  const own = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, account_id, created_at) VALUES (?, 'allmove@x.io', 'Me', ?, ?) RETURNING id", id, id, t))!.id;
  const stranger = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's2@send.io', 'S', ?) RETURNING id", id, t))!.id;
  const file = wav();
  const track = async (sender: number, k: string) => {
    await (await storage()).put(k, file, "audio/wav");
    return (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','Me',?,?,'m.wav','audio/wav',?,?) RETURNING id",
      id,
      sender,
      `tok-${k}`,
      k,
      file.length,
      t,
    ))!.id;
  };
  for (const n of [1, 2, 3]) await track(own, `audio/${id}/all-${n}.wav`);
  const sent = await track(stranger, `audio/${id}/all-sent.wav`);
  assert.equal(await lib.ownCollectionTrackCount(desk), 3, "a sender's track isn't counted");

  // Room for two: two move, one stays, and the desk is told Projects are full.
  await q.run("UPDATE plans SET library_limit = 2 WHERE id = 'free'");
  assert.deepEqual(await lib.moveAllOwnToProjects(desk), { moved: 2, left: 1, full: true });
  assert.equal(await lib.ownCollectionTrackCount(desk), 1);
  // More room: the rest moves; running it again moves nothing.
  await q.run("UPDATE plans SET library_limit = 10 WHERE id = 'free'");
  assert.deepEqual(await lib.moveAllOwnToProjects(desk), { moved: 1, left: 0, full: false });
  assert.deepEqual(await lib.moveAllOwnToProjects(desk), { moved: 0, left: 0, full: false });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM library_tracks WHERE user_id = ?", id), 3);
  const kept = await q.get<{ deleted_at: number | null; file_key: string | null }>("SELECT deleted_at, file_key FROM tracks WHERE id = ?", sent);
  assert.deepEqual([kept!.deleted_at, kept!.file_key], [null, `audio/${id}/all-sent.wav`], "the sender's track is untouched");
});
