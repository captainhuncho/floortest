import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";
import { agreeTerms } from "./agree-terms";

// Marking one track played out follows the same rule as the batch (17 Nov): DJ desks only, owner and A&R / Admin.
// The real server action, signed in through real sessions in a request scope the test controls.
process.env.DATA_DIR = testDataDir("ft-played-out-permission-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
delete process.env.VERCEL_ENV;

let n = 0;
async function person(kind: "dj" | "label", plan = "free") {
  const { q, now } = await import("../src/lib/db");
  n++;
  const id = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES (?, 'h', ?, ?, ?, ?, 'UTC', ?, ?, ?) RETURNING id",
    `po${n}@example.test`, `Person ${n}`, `pouser${n}`, plan, kind, now(), now(), now(),
  ))!.id);
  await agreeTerms(id);
  return id;
}

async function keptTrack(userId: number) {
  const { q, now } = await import("../src/lib/db");
  n++;
  const sender = Number((await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", userId, `s${n}@example.test`, now()))!.id);
  return Number((await q.get<{ id: number }>(
    `INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at, sets_ok)
     VALUES (?, ?, ?, 'A', ?, ?, 'u.wav', 'audio/wav', 1, ?, 'kept', ?, 1) RETURNING id`,
    userId, sender, `t${n}`, `potok-${n}`, `audio/po${n}.wav`, now(), now(),
  ))!.id);
}

async function signIn(userId: number, deskId?: number) {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "10.9.0.1", () => createSession(userId));
  if (deskId) jar.set("ft_desk", String(deskId));
  return jar;
}

async function markAs(jar: Jar, trackId: number) {
  const { playedOut } = await import("../src/app/dashboard/actions/review");
  return (await inRequest(jar, "10.9.0.1", () => playedOut(trackId, "Saturday"), { dropAfter: true })).answer;
}

async function playedOutAt(trackId: number) {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ at: number | null }>("SELECT played_out_at AS at FROM tracks WHERE id = ?", trackId))!.at;
}

/** The signal row and the sender's email a mark leaves behind. */
async function traces(trackId: number, userId: number) {
  const { q } = await import("../src/lib/db");
  const events = (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM events WHERE track_id = ? AND type = 'played_out'", trackId))!.n;
  const mail = (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM outbox WHERE user_id = ?", userId))!.n;
  return { events: Number(events), mail: Number(mail) };
}

test("a team Member can't mark a kept track played out; an A&R / Admin on the same desk can", async () => {
  const { q, now } = await import("../src/lib/db");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  const owner = await person("dj", "team");
  const member = await person("dj");
  const admin = await person("dj");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner, member, now());
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", owner, admin, now());
  const track = await keptTrack(owner);

  assert.equal(await markAs(await signIn(member, owner), track), false, "a Member is refused");
  assert.equal(await playedOutAt(track), null, "nothing marked, so no email to the sender");
  assert.deepEqual(await traces(track, owner), { events: 0, mail: 0 }, "no signal row, no email");

  assert.equal(await markAs(await signIn(admin, owner), track), true, "an A&R / Admin on the same desk can");
  assert.ok(await playedOutAt(track));
  assert.deepEqual(await traces(track, owner), { events: 1, mail: 1 }, "one signal row, one email to the sender");
});

test("a desk without the played-out tool can't mark its own kept track played out", async () => {
  const label = await person("label");
  const track = await keptTrack(label);
  assert.equal(await markAs(await signIn(label), track), false);
  assert.equal(await playedOutAt(track), null);
  assert.deepEqual(await traces(track, label), { events: 0, mail: 0 });
});
