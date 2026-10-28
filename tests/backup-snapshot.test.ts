import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-backup-snapshot-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.BACKUP_KEY = "test-backup-key-".padEnd(48, "z");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.BACKUP_BUCKET;

// Batch C, 28 Oct: tables were read one by one, so a track saved mid-backup could land without its sender. Every table
// is now read inside one read-only, repeatable-read transaction: the whole backup shows a single moment.
test("a backup reads every table inside one read-only snapshot", async () => {
  const { q } = await import("../src/lib/db");
  const { runBackup } = await import("../src/lib/backup");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('s@x.io','h','S','snap','pro','UTC',?)", Date.now());

  const outside: string[] = [];
  const inside: string[] = [];
  const all = q.all;
  const tx = q.tx;
  q.all = (async (sql: string, ...a: unknown[]) => {
    if (/^SELECT \* FROM/.test(sql)) outside.push(sql);
    return all.call(q, sql, ...a);
  }) as typeof q.all;
  q.tx = (async (fn: Parameters<typeof q.tx>[0]) =>
    tx.call(q, (db) =>
      fn({
        ...db,
        run: (sql: string, ...a: unknown[]) => (inside.push(sql), db.run(sql, ...a)),
        get: (sql: string, ...a: unknown[]) => (inside.push(sql), db.get(sql, ...a)),
        all: (sql: string, ...a: unknown[]) => (inside.push(sql), db.all(sql, ...a)),
      } as never),
    )) as typeof q.tx;
  try {
    const r = await runBackup();
    assert.ok(r.rows > 0);
  } finally {
    q.all = all;
    q.tx = tx;
  }
  assert.deepEqual(outside, [], "no table is read outside the snapshot");
  assert.match(inside[0] ?? "", /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/i, "the snapshot starts first");
  assert.ok(inside.some((s) => s === 'SELECT * FROM "users"'), "tables are read inside it");
});
