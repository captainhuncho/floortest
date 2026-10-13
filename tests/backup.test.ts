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
