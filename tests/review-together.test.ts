import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-team-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("Review Together: owner and teammates review; outsiders and earlier tracks stay out; shortlist and comments", async () => {
  const { q } = await import("../src/lib/db");
  const { reviewTrack, addComment, commentsFor, removeComment, toggleShortlist, shortlistOf } = await import("../src/lib/team");
  const now = Date.now();
  const user = async (handle: string, plan = "free") =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?) RETURNING id", `${handle}@x.io`, handle, handle, plan, now))!.id;
  const owner = await user("owner", "team");
  const mate = await user("mate");
  const stranger = await user("stranger");
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Callout', ?) RETURNING id", owner, now))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, now))!.id;
  const track = async (title: string, at: number) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,?,'A',?, 'audio/x.wav','x.wav','audio/wav',1,?) RETURNING id",
      owner, sender, col, title, `tok-${title}`, at,
    ))!.id;
  const before = await track("Before", now - 10_000);
  await q.run("INSERT INTO collection_members (collection_id, user_id, added_at) VALUES (?,?,?)", col, mate, now - 5_000);
  const after = await track("After", now);

  // Who can review what.
  assert.equal((await reviewTrack(owner, after))?.role, "owner");
  assert.equal((await reviewTrack(mate, after))?.role, "member");
  assert.equal(await reviewTrack(mate, before), undefined, "a teammate never sees tracks sent before they joined");
  assert.equal(await reviewTrack(stranger, after), undefined);

  // One shared shortlist: on, then off by anyone on the team.
  assert.equal(await toggleShortlist(mate, { id: after }), true);
  assert.equal((await shortlistOf(after))?.name, "mate");
  assert.equal(await toggleShortlist(owner, { id: after }), false);
  assert.equal(await shortlistOf(after), undefined);

  // Comments: only the author can remove theirs.
  await addComment(mate, { id: after }, "  Big drop at 1:30  ");
  const [c] = await commentsFor(after);
  assert.equal(c.body, "Big drop at 1:30");
  await removeComment(owner, c.id);
  assert.equal((await commentsFor(after)).length, 1, "the owner can't delete a teammate's comment");
  await removeComment(mate, c.id);
  assert.equal((await commentsFor(after)).length, 0);
});
