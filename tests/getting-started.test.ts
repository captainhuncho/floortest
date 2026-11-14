import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

process.env.DATA_DIR = testDataDir("ft-getting-started-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;

const DAY = 86_400_000;
const t = Date.now();

async function setup(handle: string, createdAt = t) {
  const { q } = await import("../src/lib/db");
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', 'R', ?, 'free', 'UTC', ?, ?) RETURNING id",
    `${handle}@start.io`, handle, createdAt, createdAt,
  ))!.id;
  return { q, id };
}

async function addTrack(userId: number, token: string, decision: string | null = null, deletedAt: number | null = null) {
  const { q } = await import("../src/lib/db");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", userId, `${token}@s.io`, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, deleted_at) VALUES (?,?,'T','A',?,?,'a.wav','audio/wav',1,?,?,?)",
    userId, sender, token, `k-${token}`, t, decision, deletedAt,
  );
}

const ids = async (userId: number, handle: string, at = t) => {
  const { gettingStarted } = await import("../src/lib/getting-started");
  const steps = await gettingStarted(userId, handle, at);
  return steps && Object.fromEntries(steps.map((s) => [s.id, s.done]));
};

test("a new account sees five open steps; each ticks off from real data", async () => {
  const { q, id } = await setup("startnew");
  assert.deepEqual(await ids(id, "startnew"), { profile: false, share: false, track: false, decide: false, twostep: false });

  // Profile needs both the photo and the line; a blank line doesn't count.
  await q.run("UPDATE users SET cover_key = 'covers/x.webp', role_line = '   ' WHERE id = ?", id);
  assert.equal((await ids(id, "startnew"))!.profile, false);
  await q.run("UPDATE users SET role_line = 'DJ, Accra' WHERE id = ?", id);
  assert.equal((await ids(id, "startnew"))!.profile, true);

  const { noteLinkShared } = await import("../src/lib/getting-started");
  await noteLinkShared(id);
  const first = (await q.get<{ s: number }>("SELECT link_shared_at AS s FROM users WHERE id = ?", id))!.s;
  await noteLinkShared(id); // set once: a later share keeps the first time
  assert.equal((await q.get<{ s: number }>("SELECT link_shared_at AS s FROM users WHERE id = ?", id))!.s, first);
  assert.equal((await ids(id, "startnew"))!.share, true);

  await addTrack(id, "tok-start-1");
  assert.deepEqual(await ids(id, "startnew"), { profile: true, share: true, track: true, decide: false, twostep: false });

  await q.run("UPDATE tracks SET decision = 'kept' WHERE token = 'tok-start-1'");
  assert.equal((await ids(id, "startnew"))!.decide, true);

  await q.run("UPDATE users SET totp_enabled_at = ? WHERE id = ?", t, id);
  assert.equal(await ids(id, "startnew"), null, "all five done: the card goes");
});

test("a track moved to Projects (retired on the desk) still counts as the first track", async () => {
  const { id } = await setup("startretired");
  await addTrack(id, "tok-retired", "kept", t);
  const s = await ids(id, "startretired");
  assert.equal(s!.track, true);
  assert.equal(s!.decide, true);
});

test("hiding the card keeps it hidden", async () => {
  const { q, id } = await setup("starthide");
  await q.run("UPDATE users SET onboarding_dismissed_at = ? WHERE id = ?", t, id);
  assert.equal(await ids(id, "starthide"), null);
});

test("the card goes 30 days after sign-up", async () => {
  const { id } = await setup("startold", t - 29 * DAY);
  assert.notEqual(await ids(id, "startold"), null, "day 29: still shown");
  assert.equal(await ids(id, "startold", t + DAY), null, "day 30: gone");
});

test("the Floor shows the card only to the account owner on their own desk", async () => {
  const { showsGettingStarted } = await import("../src/lib/getting-started");
  assert.equal(showsGettingStarted({ id: 1, actor_id: 1, role: "owner" }, false), true, "owner, own desk");
  assert.equal(showsGettingStarted({ id: 1, actor_id: 1, role: "owner" }, true), false, "admin View as");
  assert.equal(showsGettingStarted({ id: 1, actor_id: 2, role: "owner" }, false), false, "someone acting for the owner");
  for (const role of ["admin", "member"]) {
    assert.equal(showsGettingStarted({ id: 1, actor_id: 1, role }, false), false, role);
  }
});
