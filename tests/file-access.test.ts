import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-file-access-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("one deny-by-default rule decides every private file: only the desk's own, live tracks, by action", async () => {
  const { q } = await import("../src/lib/db");
  const { fileAccess } = await import("../src/lib/file-access");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number; plan: string }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id, plan",
      `${handle}@x.io`, handle, handle, t, t,
    ))!;
  const mine = await user("mine");
  const theirs = await user("theirs");
  // Each desk's own sender: the database refuses a track filed under another desk's sender (migration 0098).
  const senderOf = async (owner: number) => (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const senders = new Map([[mine.id, await senderOf(mine.id)], [theirs.id, await senderOf(theirs.id)]]);
  const track = async (owner: number, token: string, decision: string | null = null, deletedAt: number | null = null) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, deleted_at) VALUES (?,?,'T','A',?,?,'a.wav','audio/wav',1,?,?,?) RETURNING id",
      owner, senders.get(owner), token, `audio/${token}.wav`, t, decision, deletedAt,
    ))!.id;
  const kept = await track(mine.id, "kept", "kept");
  const fresh = await track(mine.id, "fresh");
  const gone = await track(mine.id, "gone", null, t);
  const other = await track(theirs.id, "other");
  const stem = (await q.get<{ id: number }>("INSERT INTO stems (track_id, file_key, name, mime, size, created_at) VALUES (?, 'stems/k.wav', 'Kick.wav', 'audio/wav', 1, ?) RETURNING id", kept, t))!.id;

  assert.equal((await fileAccess(mine, "play", kept))?.key, "audio/kept.wav", "my track plays");
  assert.equal((await fileAccess(mine, "download", fresh))?.key, "audio/fresh.wav");
  assert.equal(await fileAccess(mine, "play", other), null, "another desk's track, even with its real id");
  assert.equal(await fileAccess(theirs, "play", kept), null, "and the other way round");
  assert.equal(await fileAccess(mine, "play", gone), null, "a deleted track");
  assert.equal(await fileAccess(null, "play", kept), null, "nobody signed in");
  assert.equal(await fileAccess(mine, "play", Number.NaN), null, "a broken id");
  assert.equal((await fileAccess(mine, "offline", kept))?.maxLinkSeconds, 300, "offline: kept, short storage link");
  assert.equal(await fileAccess(mine, "offline", fresh), null, "offline: only kept tracks");
  assert.equal(await fileAccess(mine, "stem", kept, stem), null, "stems are off for this plan");
  assert.equal(await fileAccess(mine, "stems", kept), null);
  assert.equal(await fileAccess(mine, "art", kept), null, "no artwork, nothing to give");
  assert.equal(await fileAccess(mine, "nonsense" as never, kept), null, "an action nobody listed");
});
