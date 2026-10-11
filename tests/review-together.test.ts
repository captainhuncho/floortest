import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-team-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("Review Together on a team desk: only the desk's tracks, one shared shortlist, comments signed by the person", async () => {
  const { q } = await import("../src/lib/db");
  const { reviewTrack, addComment, commentsFor, removeComment, toggleShortlist, shortlistOf, teamSize } = await import("../src/lib/team");
  const now = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
  const user = async (handle: string, plan = "free") =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?) RETURNING id", `${handle}@x.io`, handle, handle, plan, now))!.id;
  const label = await user("label", "team");
  const mate = await user("mate");
  const other = await user("other");
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Callout', ?) RETURNING id", label, now))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", label, now))!.id;
  const track = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'T','A','tok-t','audio/x.wav','x.wav','audio/wav',1,?) RETURNING id",
    label, sender, col, now,
  ))!.id;
  assert.equal(await teamSize(label), 0, "no team, no team tools");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, mate, now);
  assert.equal(await teamSize(label), 1);

  // On the label's desk (the desk is the account; the person is the actor).
  const asMate = { id: label, actor_id: mate, role: "member" as const };
  const asOwner = { id: label, actor_id: label, role: "owner" as const };
  assert.ok(await reviewTrack(asMate, track));
  assert.equal(await reviewTrack({ id: other }, track), undefined, "another desk can't reach it");

  // One shared shortlist: on, then off by anyone on the team.
  assert.equal(await toggleShortlist(mate, { id: track }), true);
  assert.equal((await shortlistOf(track))?.name, "mate");
  assert.equal(await toggleShortlist(label, { id: track }), false);

  // Comments are signed by the person; members remove only their own, the owner and admins can remove any (override).
  await addComment(mate, { id: track }, "  Big drop at 1:30  ");
  await addComment(label, { id: track }, "Agreed");
  const [c, d] = await commentsFor(track);
  assert.equal(c.body, "Big drop at 1:30");
  assert.equal(c.name, "mate");
  await removeComment(asMate, d.id);
  assert.equal((await commentsFor(track)).length, 2, "a member can't delete someone else's comment");
  await removeComment(asOwner, c.id);
  assert.equal((await commentsFor(track)).length, 1, "the owner can");
});
