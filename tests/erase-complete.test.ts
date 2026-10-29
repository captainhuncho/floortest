import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-erase-complete-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;

const t = Date.now();

async function desk(handle: string) {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', 'R', ?, 'pro', 'UTC', ?, ?) RETURNING id",
    `${handle}@erase.io`, handle, t, t,
  ))!.id;
}

async function collection(userId: number, name: string, artKey: string | null) {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, art_key, created_at) VALUES (?, ?, ?, ?) RETURNING id", userId, name, artKey, t))!.id;
}

async function stored(key: string) {
  const { storage, localStoragePath } = await import("../src/lib/storage");
  await (await storage()).put(key, new Uint8Array([1, 2, 3]), "image/webp");
  return () => fs.existsSync(localStoragePath(key));
}

// Batch C, 28 Oct: collection artwork stayed in storage after its collection or account was deleted.
test("deleting a collection deletes its artwork; its tracks stay, unsorted, and the link moves on", async () => {
  const { q } = await import("../src/lib/db");
  const { removeCollection } = await import("../src/lib/deletion");
  const uid = await desk("erasecoll");
  const keep = await collection(uid, "Keep", null);
  const gone = await collection(uid, "Gone", "collection-art/gone-a.webp");
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", gone, uid);
  const s = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@erase.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'T','A','tok-erasecoll','audio/e.wav','e.wav','audio/wav',1,?)",
    uid, s, gone, t,
  );
  const artThere = await stored("collection-art/gone-a.webp");
  assert.ok(artThere());

  await removeCollection(uid, gone);
  assert.equal(artThere(), false, "the artwork file is gone");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM collections WHERE id = ?", gone), 0);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND collection_id IS NULL", uid), 1, "the track is kept, unsorted");
  assert.equal((await q.get<{ c: number }>("SELECT active_collection_id AS c FROM users WHERE id = ?", uid))!.c, keep);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM storage_deletions"), 0, "nothing left waiting");
});

test("deleting an account deletes every collection's artwork too", async () => {
  const { q } = await import("../src/lib/db");
  const { accountKeys } = await import("../src/lib/deletion");
  const { purgeAccount } = await import("../src/lib/privacy");
  const uid = await desk("eraseacct");
  await collection(uid, "One", "collection-art/one-a.webp");
  await collection(uid, "Two", null);
  assert.ok((await accountKeys(q, uid)).includes("collection-art/one-a.webp"));
  const artThere = await stored("collection-art/one-a.webp");
  await purgeAccount(uid);
  assert.equal(artThere(), false);
});

// Batch C, 28 Oct: erasing a sender left their queued emails and newsletter entry behind.
test("erasing a sender leaves nothing with their address: emails, newsletter, waitlist, messages, reopen alerts", async () => {
  const { q } = await import("../src/lib/db");
  const { dataFor, eraseSender } = await import("../src/lib/privacy");
  const uid = await desk("erasesnd");
  const e = "gone@erase.io";
  await q.run("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'Gone', ?)", uid, e, t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, ?, 'Receipt', 'b', 'sent', 'sender', ?)", uid, "Gone@Erase.io", t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, ?, 'Reopened', 'b', 'queued', 'sender', ?)", uid, e, t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, 'keep@erase.io', 'Other', 'b', 'sent', 'sender', ?)", uid, t);
  await q.run("INSERT INTO newsletter_subscribers (email, token, created_at) VALUES (?, 'nl-tok-gone', ?)", e, t);
  await q.run("INSERT INTO waitlist (email, created_at) VALUES (?, ?)", e, t);
  await q.run("INSERT INTO reopen_alerts (user_id, email, created_at) VALUES (?, ?, ?)", uid, e, t);

  const before = await dataFor(e);
  assert.ok((before as { newsletter?: unknown }).newsletter, "the export shows the newsletter entry");
  await eraseSender(e);

  const left = async (sql: string) => q.count(sql, e);
  assert.equal(await left("SELECT COUNT(*) AS n FROM outbox WHERE lower(to_email) = ?"), 0, "queued and sent emails");
  assert.equal(await left("SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE lower(email) = ?"), 0);
  assert.equal(await left("SELECT COUNT(*) AS n FROM waitlist WHERE lower(email) = ?"), 0);
  assert.equal(await left("SELECT COUNT(*) AS n FROM reopen_alerts WHERE lower(email) = ?"), 0);
  assert.equal(await left("SELECT COUNT(*) AS n FROM senders WHERE lower(email) = ?"), 0);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'keep@erase.io'"), 1, "other people's emails stay");
});
