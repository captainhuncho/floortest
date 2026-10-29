import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-open-capacity-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;
delete process.env.RESEND_API_KEY;

const meta = (email: string) => ({
  name: "S", email, title: "T", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true,
});

test("uploads that are started but not finished hold a desk slot, so they can't pile up past the desk's capacity", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { startUpload, startOwnerUpload } = await import("../src/lib/intake");
  const t = Date.now();
  await q.run("UPDATE plans SET track_limit = 3 WHERE id = 'pro'");
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('cap@x.io','h','Cap','capdesk','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'old@x.io', 'O', ?) RETURNING id", uid, t))!.id;
  await q.run("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','cap-tok','audio/a.wav','a.wav','audio/wav',1,?)", uid, sender, t);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))! as never;

  await startUpload(receiver, meta("one@x.io"), 1000, "1.1.1.1");
  await startUpload(receiver, meta("two@x.io"), 1000, "1.1.1.2");
  // One track and two open uploads fill the three slots.
  await assert.rejects(startUpload(receiver, meta("three@x.io"), 1000, "1.1.1.3"), /isn't accepting new tracks/);
  await assert.rejects(startOwnerUpload(receiver, col, { fileName: "o.wav", size: 1000, title: "Own", artist: "", genre: "", rights: true }), /desk is full/);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ?", uid), 2, "refused starts leave no reservation");

  // An upload abandoned long ago (the clean-up removes it) no longer holds a slot.
  await q.run("UPDATE uploads SET created_at = ? WHERE receiver_id = ? AND meta::jsonb->>'email' = 'one@x.io'", t - 3 * 3_600_000, uid);
  await startUpload(receiver, meta("three@x.io"), 1000, "1.1.1.3");
});
