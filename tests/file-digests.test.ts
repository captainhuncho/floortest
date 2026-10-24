import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-file-digests-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;

const hex = (b: Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

test("stored files are fingerprinted by the server; a changed or missing file is caught, held back and reported", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { recordStoredDigest, runDigests } = await import("../src/lib/file-digests");
  const { fileAccess } = await import("../src/lib/file-access");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('d@x.io','h','D','digestdesk','pro','UTC',?,?) RETURNING id",
    t, t,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  const track = async (key: string, bytes: Uint8Array | null) => {
    if (bytes) await store.put(key, bytes, "audio/wav");
    return (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A',?,?,'a.wav','audio/wav',?,?) RETURNING id",
      uid, sender, `tk-${key}`, key, bytes?.byteLength ?? 10, t,
    ))!.id;
  };
  const one = crypto.randomBytes(5000);
  const two = crypto.randomBytes(7000);
  const a = await track(`audio/${uid}/a.wav`, one);
  const b = await track(`audio/${uid}/b.wav`, two);
  const gone = await track(`audio/${uid}/gone.wav`, null);

  // At acceptance: read back from storage, not taken from the browser.
  await recordStoredDigest(`audio/${uid}/a.wav`);
  const row = await q.get<{ sha256: string; size: number; status: string }>("SELECT sha256, size, status FROM file_digests WHERE file_key = ?", `audio/${uid}/a.wav`);
  assert.deepEqual({ ...row, size: Number(row!.size) }, { sha256: hex(one), size: 5000, status: "ok" });

  // Nightly: fills in the ones with none (b), re-checks a, and finds the missing one.
  const first = await runDigests(30_000);
  assert.equal(first.fingerprinted, 2, "b and the missing one");
  assert.equal(first.failed, 1);
  assert.equal((await q.get<{ sha256: string }>("SELECT sha256 FROM file_digests WHERE file_key = ?", `audio/${uid}/b.wav`))!.sha256, hex(two));
  assert.equal((await q.get<{ status: string }>("SELECT status FROM file_digests WHERE file_key = ?", `audio/${uid}/gone.wav`))!.status, "missing");

  // The bytes change behind the app's back: the next check catches it and the file is held back.
  await store.put(`audio/${uid}/a.wav`, crypto.randomBytes(5000), "audio/wav");
  const second = await runDigests(30_000);
  assert.equal(second.failed, 1);
  assert.equal((await q.get<{ status: string }>("SELECT status FROM file_digests WHERE file_key = ?", `audio/${uid}/a.wav`))!.status, "mismatch");
  const me = { id: uid, plan: "pro" };
  assert.equal(await fileAccess(me, "play", a), null, "quarantined: no playback");
  assert.equal(await fileAccess(me, "download", a), null, "or download");
  assert.equal(await fileAccess(me, "play", gone), null);
  assert.ok(await fileAccess(me, "play", b), "the untouched file still plays");
  const alerts = await q.all<{ message: string; detail: string }>("SELECT message, detail FROM incidents WHERE message LIKE '%fingerprint%'");
  assert.equal(alerts.length, 2, "one alert per run that found something");
  assert.ok(alerts.every((x) => !x.detail.includes("a.wav") && !x.message.includes("a.wav")), "no file names in alerts");

  // A file deleted since is dropped from the fingerprints, never reported.
  await q.run("UPDATE tracks SET file_key = NULL WHERE id = ?", b);
  await runDigests(30_000);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM file_digests WHERE file_key = ?", `audio/${uid}/b.wav`), 0);
});
