import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-decisions-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: Keep, Not for me, clear and undo run as the signed-in person", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { clearDecision, decide, undoDecision } = await import("../src/lib/review");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id",
      `${handle}@decide.io`, handle, handle, now, now,
    ))!.id;
  const track = async (desk: number) => {
    const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}@send.io`, now))!.id;
    return (await q.get<{ id: number; sender_id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id, sender_id",
      desk, sender, `tok-${desk}-${Math.random()}`, now,
    ))!;
  };
  const desk = (id: number, actor = id) => ({ id, actor_id: actor, role: "owner" }) as never;
  const decision = async (id: number) => (await q.get<{ decision: string | null }>("SELECT decision FROM tracks WHERE id = ?", id))!.decision;
  const events = (id: number) => q.count("SELECT COUNT(*)::int AS n FROM events WHERE track_id = ?", id);

  const ama = await user("ama");
  const kofi = await user("kofi");
  const amaTrack = await track(ama);
  const kofiTrack = await track(kofi);

  // Own desk: the decision, its log entry, clearing and undo all work under the rules.
  const r = await asPerson(ama, () => decide(desk(ama), amaTrack as never, "kept"));
  assert.ok(r);
  assert.equal(await decision(amaTrack.id), "kept");
  assert.equal(await events(amaTrack.id), 1);
  await asPerson(ama, () => undoDecision(desk(ama), amaTrack as never, r.prev, r.eventId));
  assert.equal(await decision(amaTrack.id), null);
  assert.equal(await events(amaTrack.id), 0);
  await asPerson(ama, () => decide(desk(ama), amaTrack as never, "passed"));
  assert.equal(await asPerson(ama, () => clearDecision(desk(ama), amaTrack)), true);
  assert.equal(await decision(amaTrack.id), null);

  // Someone else's track, even with the desk check fooled: the database shows nothing, so nothing changes.
  assert.equal(await asPerson(ama, () => decide(desk(kofi, ama), kofiTrack as never, "kept")), null);
  assert.equal(await asPerson(ama, () => clearDecision(desk(kofi, ama), kofiTrack)), false);
  await asPerson(ama, () => undoDecision(desk(kofi, ama), kofiTrack as never, { decision: "kept", decided_at: now }, 0));
  assert.equal(await decision(kofiTrack.id), null);
  assert.equal(await events(kofiTrack.id), 0);
});
