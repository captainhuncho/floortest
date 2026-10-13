import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-undo-own-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("undo removes only the undoer's own keep or not-for-me, never a teammate's note", async () => {
  const { q, logEvent } = await import("../src/lib/db");
  const { undoDecision } = await import("../src/lib/review");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, handle, handle, t, t))!.id;
  const owner = await user("owner");
  const member = await user("member");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const track = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at) VALUES (?,?,'T','A','tok-undo','audio/u.wav','u.wav','audio/wav',1,?, 'kept', ?) RETURNING id",
    owner, sender, t, t,
  ))!;
  const ev = (actor: number, type: "note" | "kept") => logEvent({ user_id: owner, actor_id: actor, sender_id: sender, track_id: track.id, type, detail: type === "note" ? "owner's note" : "" });
  const ownersNote = await ev(owner, "note");
  const ownersKeep = await ev(owner, "kept");
  const membersKeep = await ev(member, "kept");
  const asMember = { id: owner, actor_id: member } as never;
  const left = async () => (await q.all<{ id: number }>("SELECT id FROM events WHERE track_id = ? ORDER BY id", track.id)).map((r) => r.id);

  await undoDecision(asMember, track as never, { decision: null, decided_at: null }, ownersNote);
  await undoDecision(asMember, track as never, { decision: null, decided_at: null }, ownersKeep);
  assert.deepEqual(await left(), [ownersNote, ownersKeep, membersKeep], "the owner's note and call stay");
  await undoDecision(asMember, track as never, { decision: null, decided_at: null }, membersKeep);
  assert.deepEqual(await left(), [ownersNote, ownersKeep], "the member's own keep goes");
});

test("the account log names the teammate who did each thing, and keeps the holder's personal entries from teammates", async () => {
  const { q } = await import("../src/lib/db");
  const { recentAudit } = await import("../src/lib/audit");
  const t = Date.now();
  const user = async (handle: string, name: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, name, handle, t, t))!.id;
  const owner = await user("logowner", "Max");
  const ama = await user("logama", "Ama");
  const log = (action: string, actor: number | null, at: number) =>
    q.run("INSERT INTO account_log (user_id, action, detail, created_at, actor_id) VALUES (?, ?, 'x', ?, ?)", owner, action, at, actor);
  await log("signed_in", null, t);
  await log("collection_activated", ama, t + 1);
  await log("collection_updated", null, t + 2);
  const forOwner = await recentAudit(owner, 10);
  assert.deepEqual(forOwner.map((r) => [r.action, r.actor_name]), [["collection_updated", null], ["collection_activated", "Ama"], ["signed_in", null]]);
  const forTeam = await recentAudit(owner, 10, { teammate: true });
  assert.deepEqual(forTeam.map((r) => r.action), ["collection_updated", "collection_activated"], "no sign-ins for teammates");
});
