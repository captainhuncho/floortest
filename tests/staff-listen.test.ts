import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-listen-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("staff may play a track only while it has an open takedown claim (owner, 1 Nov 2026)", async () => {
  const { q } = await import("../src/lib/db");
  const { staffMayPlay } = await import("../src/lib/staff-listen");
  const now = Date.now();
  const user = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('dj@listen.io', 'h', 'DJ', 'dj', 'free', 'UTC', ?, ?) RETURNING id",
    now, now,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'artist@listen.io', 'Artist', ?) RETURNING id", user, now))!.id;
  const track = async (title: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, file_key, created_at) VALUES (?, ?, ?, ?, 'Artist', 'a.wav', 'audio/wav', 10, 'k', ?) RETURNING id",
      user, sender, `tok-${title}`, title, now,
    ))!.id;
  const claim = (trackId: number, status: string) =>
    q.run("INSERT INTO takedowns (track_id, claimant, claimant_email, status, created_at) VALUES (?, 'Label', 'legal@label.io', ?, ?)", trackId, status, now);

  const plain = await track("plain");
  const disputed = await track("disputed");
  const closed = await track("closed");
  await claim(disputed, "open");
  await claim(closed, "rejected");
  await claim(closed, "removed");

  assert.equal(await staffMayPlay(plain), false, "a track with no claim is refused");
  assert.equal(await staffMayPlay(disputed), true, "a track with an open claim plays");
  assert.equal(await staffMayPlay(closed), false, "a decided claim no longer opens the track");
  assert.equal(await staffMayPlay(999_999), false, "a missing track gets the same answer");
  assert.equal(await staffMayPlay(0), false);
  assert.equal(await staffMayPlay(Number.NaN), false);

  await q.run("UPDATE takedowns SET status = 'rejected', decided_at = ? WHERE track_id = ?", now, disputed);
  assert.equal(await staffMayPlay(disputed), false, "deciding the claim closes listening again");
});

test("the audio route refuses before it looks the track up, so a refusal reads like a missing track", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/api/admin/tracks/[id]/audio/route.ts"), "utf8");
  const guard = src.indexOf("staffMayPlay(id)");
  assert.ok(guard > 0, "the route checks staffMayPlay");
  assert.ok(guard < src.indexOf("FROM tracks t"), "the check runs before the track query");
  assert.match(src.slice(guard, guard + 300), /"refused play"[\s\S]*status: 404/, "a refusal is logged and answered 404");
});
