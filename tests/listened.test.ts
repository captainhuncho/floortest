import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-listened-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const S1 = "1".repeat(64);
const S2 = "2".repeat(64);

async function setup(token: string) {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const owner = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', 'Owner', ?, 'team', 'UTC', ?, ?) RETURNING id",
    `${token}@x.io`, token, t, t,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, duration) VALUES (?,?,'T','A',?,'audio/l.wav','l.wav','audio/wav',1,?,300) RETURNING id",
    owner, sender, token, t,
  ))!.id;
  const user = { id: owner, actor_id: owner, name: "Owner" } as never;
  const track = async () => (await q.get("SELECT * FROM tracks WHERE id = ?", id)) as never as { played_at: number | null };
  const events = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM events WHERE track_id = ? AND type = 'played'", id))!.n;
  return { user, track, events };
}

test("a track counts as listened only after 30 s of real time, and exactly once", async () => {
  const { recordListen } = await import("../src/lib/review");
  const { user, track, events } = await setup("tok-honest");
  const t0 = 1_900_000_000_000;
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0), false, "a check-in with no play started counts for nothing");
  await recordListen(user, await track() as never, "play", S1, t0);
  let first = false;
  for (let s = 10; s <= 30 && !first; s += 10) first = await recordListen(user, await track() as never, "beat", S1, t0 + s * 1000);
  assert.equal(first, true, "three 10-second check-ins make 30 s");
  assert.ok((await track()).played_at, "played_at is set");
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0 + 40_000), false, "never twice");
  assert.equal(await events(), 1, "one Listened event, one email");
});

test("a forged or replayed check-in can't claim time that didn't pass", async () => {
  const { recordListen } = await import("../src/lib/review");
  const { user, track } = await setup("tok-forged");
  const t0 = 1_900_000_000_000;
  await recordListen(user, await track() as never, "play", S1, t0);
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0 + 600_000), false, "one check-in after 10 minutes earns only 15 s");
  for (let i = 0; i < 20; i++) await recordListen(user, await track() as never, "beat", S1, t0 + 600_000);
  assert.equal((await track()).played_at, null, "the same check-in sent again earns nothing");
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0 + 500_000), false, "a check-in from the past earns nothing");
  assert.equal((await track()).played_at, null);
  assert.equal(await recordListen(user, await track() as never, "beat", S2, t0 + 610_000), false, "another sign-in can't add to this listen");
  assert.equal((await track()).played_at, null);
});

test("pausing earns nothing, and a second tab can't double the time", async () => {
  const { recordListen } = await import("../src/lib/review");
  const { user, track } = await setup("tok-tabs");
  const t0 = 1_900_000_000_000;
  await recordListen(user, await track() as never, "play", S1, t0);
  await recordListen(user, await track() as never, "beat", S1, t0 + 10_000);
  // Paused for an hour, then resumed: "play" restarts the clock without crediting the pause.
  await recordListen(user, await track() as never, "play", S1, t0 + 3_600_000);
  // Two tabs on the same sign-in checking in alternately every 5 s: 10 s of real time is 10 s, not 20.
  await recordListen(user, await track() as never, "beat", S1, t0 + 3_605_000);
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0 + 3_610_000), false, "10 + 10 s is still short of 30");
  assert.equal((await track()).played_at, null);
  assert.equal(await recordListen(user, await track() as never, "beat", S1, t0 + 3_620_000), true, "the next real 10 s makes 30");
});
