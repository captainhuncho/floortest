import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, storage folder and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-storage-audit-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;

test("storage move check: lists every expected file and finds what's missing or the wrong size", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const A = await import("../src/lib/storage-audit");
  const now = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, cover_key, created_at) VALUES ('a@x.io', 'h', 'A', 'a', 'free', 'UTC', 'covers/a.webp', ?) RETURNING id",
    now,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, now))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, art_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','t1','audio/1/ok.wav','art/1.webp','ok.wav','audio/wav',4,?)",
    uid, sender, now,
  );
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'U','A','t2','audio/1/short.wav','s.wav','audio/wav',10,?)",
    uid, sender, now,
  );
  await q.run("INSERT INTO site_content (page, draft, published, updated_at) VALUES ('home', '{}', ?, ?)", JSON.stringify({ hero: "site/abcdef123456.webp" }), now);
  await q.run("INSERT INTO app_state (key, value, updated_at) VALUES ('backup_keys', ?, ?)", JSON.stringify(["backups/db-2026-10-11T0330.json.gz.enc"]), now);

  const files = await A.expectedFiles();
  assert.deepEqual(new Set(files.map((f) => f.kind)), new Set(["track audio", "track artwork", "profile cover", "site image", "database backup"]));
  assert.equal(files.length, 6);

  // Only two files exist: one right, one the wrong size.
  const store = await storage();
  await store.put("audio/1/ok.wav", new Uint8Array(4), "audio/wav");
  await store.put("audio/1/short.wav", new Uint8Array(3), "audio/wav");
  const r = await A.checkBucket("floortest-audio-eu");
  assert.equal(r.present, 1);
  assert.deepEqual(r.wrongSize.map((w) => [w.key, w.want, w.got]), [["audio/1/short.wav", 10, 3]]);
  assert.equal(r.missing.length, 4);
  assert.ok(r.finished);
  assert.equal((await A.lastChecks())[0].bucket, "floortest-audio-eu");
  await assert.rejects(A.checkBucket("someone-elses-bucket"), /Not a bucket in the move/);
});
