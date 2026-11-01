import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-notes-replies-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: notes and held replies are written as the person, never onto another desk", async () => {
  const { q, asPerson, logEvent } = await import("../src/lib/db");
  const { holdReply } = await import("../src/lib/account-members");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@notes.io`, handle, handle, now, now,
    ))!.id;
  const sender = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}@send.io`, now))!.id;
  const note = (actor: number, desk: number, senderId: number) =>
    asPerson(actor, () => logEvent({ user_id: desk, actor_id: actor, sender_id: senderId, track_id: null, type: "note", detail: "good one" }));
  const notes = (desk: number) => q.count("SELECT COUNT(*)::int AS n FROM events WHERE user_id = ? AND type = 'note'", desk);
  const held = (desk: number) => q.count("SELECT COUNT(*)::int AS n FROM held_replies WHERE account_id = ?", desk);

  const label = await user("label");
  const efua = await user("efua"); // a member of the label's team
  const kofi = await user("kofi");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);
  const labelSender = await sender(label);
  const kofiSender = await sender(kofi);

  // On a desk they work: the note and the held reply go in.
  await note(efua, label, labelSender);
  assert.equal(await notes(label), 1);
  await asPerson(efua, () => holdReply({ id: label, actor_id: efua }, labelSender, null, "Thanks, keeping it"));
  assert.equal(await held(label), 1);

  // Another desk, even with the desk check fooled: the database refuses both.
  await assert.rejects(note(efua, kofi, kofiSender), /row-level security/);
  await assert.rejects(asPerson(efua, () => holdReply({ id: kofi, actor_id: efua }, kofiSender, null, "x")), /row-level security/);
  assert.equal(await notes(kofi), 0);
  assert.equal(await held(kofi), 0);
});

test("a sent reply runs as the app only after the sender and track were found as the person", () => {
  // Server actions need a signed-in request, so this checks the code path: the email is queued in the app's own
  // mail queue, together with the track's "replied" mark, so that step runs through asSystem on purpose.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/review.ts", import.meta.url), "utf8");
  const send = src.slice(src.indexOf("export async function replyToSender"), src.indexOf("export async function askForStems"));
  assert.match(send, /const s = await ownedSender\(u, senderId\)/);
  assert.match(send, /await ownedTrack\(u, trackId\)/);
  assert.match(send, /asPerson\(u\.actor_id, \(\) => holdReply\(/);
  assert.match(send, /asSystem\(\(\) => reply\(u, s, t, body\)\)/);
  const noteSrc = src.slice(src.indexOf("export async function addNote"), src.indexOf("const REPLY_REPEAT_MS"));
  assert.match(noteSrc, /asPerson\(u\.actor_id, \(\) => logEvent\(/);
});
