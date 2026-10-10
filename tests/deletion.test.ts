import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { toPositional } from "../src/lib/db/client";
import { MIGRATIONS } from "../src/lib/db/migrations";
import { accountKeys, drainDeletions, handOverFolderCovers, queueDeletion, trackKeys } from "../src/lib/deletion-core";

async function setup() {
  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  const db = {
    run: async (sql: string, ...a: unknown[]) => ({ changes: (await pg.query(toPositional(sql), a)).affectedRows ?? 0 }),
    get: async <T,>(sql: string, ...a: unknown[]) => (await pg.query(toPositional(sql), a)).rows[0] as T | undefined,
    all: async <T,>(sql: string, ...a: unknown[]) => (await pg.query(toPositional(sql), a)).rows as T[],
  };
  await db.run("INSERT INTO users (email, password_hash, name, handle, tz, cover_key, created_at) VALUES ('r@x.io','h','R','r','UTC','covers/r.jpg',0)");
  await db.run("INSERT INTO senders (user_id, email, name, created_at) VALUES (1,'a@x.io','A',0)");
  await db.run("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (1,1,'T','A','tok','audio/t.wav','t.wav','audio/wav',1,0)");
  await db.run("INSERT INTO stems (track_id, file_key, name, mime, size, created_at) VALUES (1,'stems/drums.wav','drums','audio/wav',1,0)");
  await db.run("UPDATE tracks SET art_key = 'track-art/1/1-a.png' WHERE id = 1");
  await db.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('u1',1,'pending/u1.wav','wav',1,'{}','x',0)");
  return db;
}

test("an account's files include audio, stems, unfinished uploads, the cover and track artwork", async () => {
  const db = await setup();
  assert.deepEqual((await accountKeys(db as never, 1)).sort(), ["audio/t.wav", "covers/r.jpg", "pending/u1.wav", "stems/drums.wav", "track-art/1/1-a.png"]);
  assert.deepEqual((await trackKeys(db as never, [1])).sort(), ["audio/t.wav", "stems/drums.wav", "track-art/1/1-a.png"]);
});

test("queued keys survive the rows being deleted, and failures stay queued until a retry succeeds", async () => {
  const db = await setup();
  await queueDeletion(db as never, await accountKeys(db as never, 1), "test", 1);
  await db.run("DELETE FROM users WHERE id = 1"); // cascades away every row that pointed at the files
  const deleted: string[] = [];
  let down = true;
  const store = { delete: async (k: string) => { if (down && k.startsWith("stems/")) throw new Error("R2 timeout"); deleted.push(k); } };
  const first = await drainDeletions(db as never, store, 2);
  assert.equal(first.failed, 1);
  const [left] = await db.all<{ file_key: string; attempts: number; last_error: string }>("SELECT * FROM storage_deletions");
  assert.equal(left.file_key, "stems/drums.wav");
  assert.equal(left.attempts, 1);
  down = false;
  assert.equal((await drainDeletions(db as never, store, 3)).deleted, 1);
  assert.equal((await db.all("SELECT * FROM storage_deletions")).length, 0);
  assert.equal(deleted.length, 5);
});

test("queuing the same file twice is harmless", async () => {
  const db = await setup();
  await queueDeletion(db as never, ["a", "a", null], "x", 1);
  await queueDeletion(db as never, ["a"], "x", 2);
  assert.equal((await db.all("SELECT * FROM storage_deletions")).length, 1);
});

/** Three tracks of one EP (ids 2, 3, 4) with the cover stored on the first. */
async function folder() {
  const db = await setup();
  await db.run("INSERT INTO releases (id, user_id, sender_id, title, artist, kind, created_at) VALUES ('relEP0000000000001',1,1,'EP','A','ep',0)");
  for (const n of [1, 2, 3])
    await db.run(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, release_id, track_no) VALUES (1,1,?,'A',?,?,'x.wav','audio/wav',1,?,'relEP0000000000001',?)",
      `T${n}`, `tok${n}`, `audio/e${n}.wav`, n, n,
    );
  await db.run("UPDATE tracks SET art_key = 'track-art/1/cover.png' WHERE id = 2");
  return db;
}
const art = async (db: Awaited<ReturnType<typeof setup>>, id: number) => (await db.get<{ art_key: string | null }>("SELECT art_key FROM tracks WHERE id = ?", id))!.art_key;

test("deleting the track that holds a folder's cover passes the cover to the next track, so it isn't deleted", async () => {
  const db = await folder();
  assert.equal(await handOverFolderCovers(db as never, [2]), 1);
  assert.equal(await art(db, 2), null);
  assert.equal(await art(db, 3), "track-art/1/cover.png");
  assert.deepEqual(await trackKeys(db as never, [2]), ["audio/e1.wav"]); // the cover isn't queued for deletion
});

test("the cover goes when the whole folder goes, and stays put if a remaining track already has artwork", async () => {
  const all = await folder();
  assert.equal(await handOverFolderCovers(all as never, [2, 3, 4]), 0);
  assert.ok((await trackKeys(all as never, [2, 3, 4])).includes("track-art/1/cover.png"));

  const own = await folder();
  await own.run("UPDATE tracks SET art_key = 'track-art/1/own.png' WHERE id = 4");
  assert.equal(await handOverFolderCovers(own as never, [2]), 0);
  assert.equal(await art(own, 3), null);
});
