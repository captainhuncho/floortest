import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-rules-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: the database shows each person only the desks they may work", async () => {
  const { q, asPerson, asSystem } = await import("../src/lib/db");
  const { ownedTrack, ownedSender } = await import("../src/lib/desk");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id",
      `${handle}@rules.io`, handle, handle, now, now,
    ))!.id;
  const sender = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}@send.io`, now))!.id;
  const track = async (desk: number, senderId: number) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id",
      desk, senderId, `tok-${desk}-${Math.random()}`, now,
    ))!.id;
  const ids = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b);

  const ama = await user("ama");
  const kofi = await user("kofi");
  const label = await user("label");
  const efua = await user("efua"); // on the label's team
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);
  const amaSender = await sender(ama);
  const kofiSender = await sender(kofi);
  const labelSender = await sender(label);
  const amaTrack = await track(ama, amaSender);
  const kofiTrack = await track(kofi, kofiSender);
  const labelTrack = await track(label, labelSender);

  // The app's own login still sees everything (nightly jobs, backups, ops).
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM tracks"), 3);

  // A person sees only their own desk's rows.
  assert.deepEqual(ids(await asPerson(ama, () => q.all<{ id: number }>("SELECT id FROM tracks"))), [amaTrack]);
  assert.equal(await asPerson(ama, () => q.count("SELECT COUNT(*)::int AS n FROM senders")), 1);

  // Second lock: even if the app's check named the wrong desk, the database refuses another person's rows.
  assert.ok(await ownedTrack({ id: ama, actor_id: ama }, amaTrack));
  assert.equal(await ownedTrack({ id: kofi, actor_id: ama }, kofiTrack), undefined);
  assert.equal(await ownedSender({ id: kofi, actor_id: ama }, kofiSender), undefined);

  // Changing someone else's rows does nothing, and writing a row onto their desk is refused.
  assert.equal((await asPerson(ama, () => q.run("UPDATE tracks SET decision = 'kept' WHERE id = ?", kofiTrack))).changes, 0);
  assert.equal((await q.get<{ decision: string | null }>("SELECT decision FROM tracks WHERE id = ?", kofiTrack))!.decision, null);
  assert.equal((await asPerson(ama, () => q.run("UPDATE users SET name = 'x' WHERE id = ?", kofi))).changes, 0);
  await assert.rejects(
    asPerson(ama, () => q.run("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Mine now', ?)", kofi, now)),
    /row-level security/,
  );

  // A teammate works the team's desk, and sees who's on the team; never anyone else.
  assert.deepEqual(ids(await asPerson(efua, () => q.all<{ id: number }>("SELECT id FROM tracks"))), [labelTrack]);
  assert.ok(await ownedTrack({ id: label, actor_id: efua }, labelTrack));
  const team = [label, efua].sort((a, b) => a - b);
  assert.deepEqual(ids(await asPerson(efua, () => q.all<{ id: number }>("SELECT id FROM users"))), team);
  assert.deepEqual(ids(await asPerson(label, () => q.all<{ id: number }>("SELECT id FROM users"))), team);

  // Removed from the team: the desk is gone at once.
  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", label, efua);
  assert.equal(await ownedTrack({ id: label, actor_id: efua }, labelTrack), undefined);

  // Tables outside the rules refuse a person outright, rather than quietly showing nothing.
  await assert.rejects(asPerson(ama, () => q.all("SELECT * FROM rate_events")), /permission denied/);
  await assert.rejects(asPerson(ama, () => q.all("SELECT * FROM sessions")), /permission denied/);

  // Transactions follow the same rules, and system work can step out on purpose.
  assert.deepEqual(ids(await asPerson(kofi, () => q.tx((t) => t.all<{ id: number }>("SELECT id FROM tracks")))), [kofiTrack]);
  assert.equal(await asPerson(ama, () => asSystem(() => q.count("SELECT COUNT(*)::int AS n FROM tracks"))), 3);

  // Nothing carries over: after person work the connection is the app's own again.
  assert.notEqual((await q.get<{ u: string }>("SELECT current_user AS u"))!.u, "ft_person");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM tracks"), 3);
  assert.throws(() => asPerson(0, async () => 1), /signed-in person/);
});
