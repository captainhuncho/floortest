import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-decision-race-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Batch C, 28 Oct: the "a member can't change an owner's or admin's call" check ran on a copy of the track loaded
// earlier, so an admin's call made in between was overwritten. The check now lives in the update itself.
test("an admin's call made while a member had the track open survives the member's keep, clear and undo", async () => {
  const { q } = await import("../src/lib/db");
  const { decide, clearDecision, undoDecision } = await import("../src/lib/review");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id", `${handle}@race.io`, handle, handle, t, t))!.id;
  const owner = await user("raceowner");
  const admin = await user("raceadmin");
  const member = await user("racemember");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@race.io', 'S', ?) RETURNING id", owner, t))!.id;
  const newTrack = async (token: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A',?,'audio/r.wav','r.wav','audio/wav',1,?) RETURNING *",
      owner, sender, token, t,
    ))! as never as { id: number; decision: string | null; decided_role: string | null };
  const asAdmin = { id: owner, actor_id: admin, role: "admin" } as never;
  const asMember = { id: owner, actor_id: member, role: "member" } as never;
  const state = async (id: number) => (await q.get<{ decision: string | null; decided_by: number | null }>("SELECT decision, decided_by FROM tracks WHERE id = ?", id))!;

  // The member opened the track while it was undecided; the admin passes it before the member clicks Keep.
  const a = await newTrack("tok-race-a");
  await decide(asAdmin, a as never, "passed");
  assert.equal(await decide(asMember, a as never, "kept"), null, "the member's keep is refused");
  assert.deepEqual(await state(a.id), { decision: "passed", decided_by: admin });
  assert.equal(await clearDecision(asMember, a as never), false, "the member's clear is refused");
  assert.equal((await state(a.id)).decision, "passed");

  // The member keeps, the admin then passes, and the member's late undo must not wipe the admin's call.
  const b = await newTrack("tok-race-b");
  const mine = await decide(asMember, b as never, "kept");
  assert.ok(mine, "an undecided track is the member's to call");
  await decide(asAdmin, b as never, "passed");
  await undoDecision(asMember, b as never, mine!.prev, mine!.eventId);
  assert.deepEqual(await state(b.id), { decision: "passed", decided_by: admin }, "the admin's later call stands");

  // Undo still works when nobody else has acted.
  const c = await newTrack("tok-race-c");
  const own = await decide(asMember, c as never, "kept");
  await undoDecision(asMember, c as never, own!.prev, own!.eventId);
  assert.deepEqual(await state(c.id), { decision: null, decided_by: null });

  // Owners and admins can still change anyone's call, a member's included.
  assert.ok(await decide(asAdmin, c as never, "kept"));
  assert.ok(await decide({ id: owner, actor_id: owner, role: "owner" } as never, c as never, "passed"));
  assert.ok(await clearDecision(asAdmin, c as never));
});
