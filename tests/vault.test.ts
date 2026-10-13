import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database, storage folder and vault for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-vault-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.BACKUP_KEY = "test-backup-key-".padEnd(48, "y");
process.env.BACKUP_BUCKET = "test-vault";
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;

test("recovery copy: new files are copied once, backups go to the vault, and deleting a file deletes its copy", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { vault, runVaultCopy } = await import("../src/lib/vault");
  const { runBackup } = await import("../src/lib/backup");
  const { discardFiles } = await import("../src/lib/deletion");
  const store = await storage();
  const v = (await vault())!;
  assert.ok(v, "the vault is on when BACKUP_BUCKET is set");

  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('v@x.io','h','V','v','free','UTC',?) RETURNING id", t))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','tv1','audio/1/keep.wav','k.wav','audio/wav',4,?)",
    uid, sender, t,
  );
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'U','A','tv2','audio/1/missing.wav','m.wav','audio/wav',9,?)",
    uid, sender, t,
  );
  await store.put("audio/1/keep.wav", new Uint8Array(4), "audio/wav");

  // First night: the file that exists is copied (at the right size); the missing one fails and is retried later.
  const first = await runVaultCopy(10_000);
  assert.deepEqual([first.on, "copied" in first && first.copied, "failed" in first && first.failed], [true, 1, 1]);
  assert.deepEqual(await v.head("audio/1/keep.wav"), { size: 4 });
  // Second night: nothing new to copy for the file already there.
  const second = await runVaultCopy(10_000);
  assert.equal("copied" in second && second.copied, 0);

  // Database backups go to the vault, not the main bucket.
  const b = await runBackup();
  assert.equal(b.vault, true);
  assert.ok(await v.head(b.key));
  assert.equal(await store.head(b.key), null);

  // A deleted file (here a discarded one) goes from storage and from the copy.
  await discardFiles(["audio/1/keep.wav"], "test");
  assert.equal(await store.head("audio/1/keep.wav"), null);
  assert.equal(await v.head("audio/1/keep.wav"), null);
  assert.equal((await q.all("SELECT 1 FROM vault_copies WHERE file_key = 'audio/1/keep.wav'")).length, 0);
});

test("recovery copy: a file deleted while the nightly copy is in flight doesn't stay in the vault", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { vault, runVaultCopy } = await import("../src/lib/vault");
  const { discardFiles } = await import("../src/lib/deletion");
  const store = await storage();
  const v = (await vault())!;
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('race@x.io','h','R','racev','free','UTC',?) RETURNING id", t))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'rs@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'R','A','tv-race','audio/1/race.wav','r.wav','audio/wav',4,?)",
    uid, sender, t,
  );
  await store.put("audio/1/race.wav", new Uint8Array(4), "audio/wav");

  // The copy reads the file; before it records anything, the track is removed and its file deleted.
  const copy = v.copyFromMain.bind(v);
  v.copyFromMain = async (key: string) => {
    await copy(key);
    if (key === "audio/1/race.wav") {
      await q.run("DELETE FROM tracks WHERE token = 'tv-race'");
      await discardFiles([key], "test: deleted mid-copy");
    }
  };
  try {
    await runVaultCopy(10_000);
  } finally {
    v.copyFromMain = copy;
  }
  assert.equal(await store.head("audio/1/race.wav"), null);
  assert.equal(await v.head("audio/1/race.wav"), null, "the copy that landed after the delete is removed");
  assert.equal((await q.all("SELECT 1 FROM vault_copies WHERE file_key = 'audio/1/race.wav'")).length, 0);
});
