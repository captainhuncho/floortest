import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { toPositional } from "../src/lib/db/client";
import { MIGRATIONS } from "../src/lib/db/migrations";
import { accountKeys, drainDeletions, queueDeletion, trackKeys } from "../src/lib/deletion-core";

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
  await db.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('u1',1,'pending/u1.wav','wav',1,'{}','x',0)");
  return db;
}

test("an account's files include audio, stems, unfinished uploads and the cover", async () => {
  const db = await setup();
  assert.deepEqual((await accountKeys(db as never, 1)).sort(), ["audio/t.wav", "covers/r.jpg", "pending/u1.wav", "stems/drums.wav"]);
  assert.deepEqual((await trackKeys(db as never, [1])).sort(), ["audio/t.wav", "stems/drums.wav"]);
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
  assert.equal(deleted.length, 4);
});

test("queuing the same file twice is harmless", async () => {
  const db = await setup();
  await queueDeletion(db as never, ["a", "a", null], "x", 1);
  await queueDeletion(db as never, ["a"], "x", 2);
  assert.equal((await db.all("SELECT * FROM storage_deletions")).length, 1);
});
