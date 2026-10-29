import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-backup-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.BACKUP_KEY = "test-backup-key-".padEnd(48, "z");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.BACKUP_BUCKET;

test("backups are encrypted, hold no sessions, codes or IPs, blank live tokens, and go after 14 days", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { runBackup, SKIP, BACKUP_KEEP_DAYS } = await import("../src/lib/backup");
  const { openBackup } = await import("../src/lib/backup-crypto");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verify_token, pending_email_token) VALUES ('b@x.io','h','B','bdesk','pro','UTC',?, 'live-verify', 'live-change') RETURNING id",
    t,
  ))!.id;
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('sess-hash', ?, ?, ?)", uid, t + 1e9, t);
  await q.run("INSERT INTO rate_events (bucket, key, created_at) VALUES ('login_fail_ip', '203.0.113.9', ?)", t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, 'b@x.io', 'Hi', 'secret link inside', 'logged', 'receiver', ?)", uid, t);

  const old = await runBackup(t - (BACKUP_KEEP_DAYS + 2) * 86_400_000);
  const { key } = await runBackup(t);
  const file = Buffer.from(await new Response((await store.stream(key)).body).arrayBuffer());
  assert.notEqual(file.subarray(0, 2).toString("hex"), "1f8b", "never a plain gzip file");
  assert.throws(() => openBackup(file, "wrong-key".padEnd(48, "q")), "unreadable without the key");
  const dump = JSON.parse(gunzipSync(openBackup(file, process.env.BACKUP_KEY!)).toString()) as { tables: Record<string, Record<string, unknown>[]> };

  for (const table of ["sessions", "admin_sessions", "link_sessions", "view_tickets", "login_codes", "sender_codes", "link_codes", "password_resets", "rate_events", "uploads"]) {
    assert.ok(SKIP.has(table));
    assert.equal(table in dump.tables, false, `${table} is not in the backup`);
  }
  const text = JSON.stringify(dump);
  assert.ok(!text.includes("203.0.113.9"), "no IP address anywhere");
  assert.ok(!text.includes("sess-hash") && !text.includes("live-verify") && !text.includes("live-change"), "no session or live token");
  assert.ok(!text.includes("secret link inside"), "email bodies are blanked");
  assert.ok(dump.tables.users.some((u) => u.email === "b@x.io"), "the data itself is there to restore");

  assert.equal(await store.head(old.key), null, "a backup older than 14 days is deleted");
});

// H79: an invite code opens an account and a receipt token opens a sender's receipt page, so neither may sit in a
// backup. Password hashes and encrypted two-factor secrets stay: a restore needs them to let people sign in.
test("a backup holds no invite code or receipt token, but keeps what a restore needs", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { runBackup } = await import("../src/lib/backup");
  const { openBackup } = await import("../src/lib/backup-crypto");
  const t = Date.now();
  await q.run("INSERT INTO invites (code, max_uses, note, created_at) VALUES ('LIVE-INVITE-7Q', 25, '', ?)", t);
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, invite_code, totp_secret) VALUES ('inv@x.io','pw-hash-kept','I','invdesk','pro','UTC',?, 'LIVE-INVITE-7Q', 'sealed-totp-kept') RETURNING id",
    t,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','live-receipt-token-9z','audio/b.wav','b.wav','audio/wav',1,?)",
    uid, sender, t,
  );

  const { key } = await runBackup(t + 60_000);
  const file = Buffer.from(await new Response((await (await storage()).stream(key)).body).arrayBuffer());
  const dump = JSON.parse(gunzipSync(openBackup(file, process.env.BACKUP_KEY!)).toString()) as { tables: Record<string, Record<string, unknown>[]> };
  const text = JSON.stringify(dump);
  assert.ok(!text.includes("LIVE-INVITE-7Q"), "no invite code anywhere");
  assert.ok(!text.includes("live-receipt-token-9z"), "no receipt token anywhere");

  const user = dump.tables.users.find((u) => u.email === "inv@x.io")!;
  assert.equal(user.password_hash, "pw-hash-kept", "password hashes stay, so people can sign in after a restore");
  assert.equal(user.totp_secret, "sealed-totp-kept", "encrypted two-factor secrets stay");
  const invite = dump.tables.invites.find((i) => i.code === user.invite_code);
  assert.ok(invite, "the account still points at its (hidden) invite, so invite use counts survive a restore");
  const track = dump.tables.tracks.find((r) => r.user_id === uid)!;
  assert.equal(typeof track.token, "string", "the column stays filled (it's required and unique)");
  assert.ok((track.token as string).length >= 32);
});
