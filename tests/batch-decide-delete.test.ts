import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-batch-decide-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// 1 Nov: batch keep, not for me, clear and delete used to run the one-by-one path per track (up to 200 transactions,
// activity inserts and storage drains). Each is now one update and one activity insert for the lot.
test("batch keep, clear and delete change the lot at once, keep the team lock and touch only the desk's own tracks", async () => {
  const { q } = await import("../src/lib/db");
  const { decide, decideMany, clearDecisions, deleteTracks } = await import("../src/lib/review");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id", `${handle}@batch.io`, handle, handle, t, t))!.id;
  const owner = await user("bdowner");
  const admin = await user("bdadmin");
  const member = await user("bdmember");
  const other = await user("bdother");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@batch.io', 'S', ?) RETURNING id", owner, t))!.id;
  const otherSender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'o@batch.io', 'O', ?) RETURNING id", other, t))!.id;
  let n = 0;
  const newTrack = async (desk = owner, from = sender) => {
    n++;
    return (await q.get<{ id: number; sender_id: number; decision: string | null; decided_role: string | null }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A',?,?,'b.wav','audio/wav',1,?) RETURNING *",
      desk, from, `tok-bd-${n}`, `audio/bd-${n}.wav`, t,
    ))!;
  };
  const asOwner = { id: owner, actor_id: owner, role: "owner" } as never;
  const asAdmin = { id: owner, actor_id: admin, role: "admin" } as never;
  const asMember = { id: owner, actor_id: member, role: "member" } as never;
  const row = async (id: number) => (await q.get<{ decision: string | null; decided_by: number | null; deleted_at: number | null; file_key: string | null }>("SELECT decision, decided_by, deleted_at, file_key FROM tracks WHERE id = ?", id))!;
  const events = async (type: string) => q.all<{ track_id: number; created_at: number }>("SELECT track_id, created_at FROM events WHERE user_id = ? AND type = ? ORDER BY id", owner, type);

  // Keep: tracks already kept are left alone, the rest change together with one activity row each, one time stamp.
  const [a, b, c] = [await newTrack(), await newTrack(), await newTrack()];
  await decide(asOwner, c as never, "kept");
  const before = (await events("kept")).length;
  const reread = async (id: number) => ({ id, decision: (await row(id)).decision as never });
  assert.deepEqual(await decideMany(asOwner, [await reread(a.id), await reread(b.id), await reread(c.id)], "kept"), { changed: 2, locked: 0 });
  const kept = (await events("kept")).slice(before);
  assert.deepEqual(kept.map((e) => Number(e.track_id)).sort(), [a.id, b.id].sort());
  assert.equal(Number(kept[0].created_at), Number(kept[1].created_at), "one insert for the batch");
  assert.equal(await decideMany(asOwner, [], "kept").then((r) => r.changed), 0);

  // A member's batch skips an admin's call, read from the row as it is now, not from the page's copy.
  const [x, y] = [await newTrack(), await newTrack()];
  await decide(asAdmin, x as never, "passed");
  assert.deepEqual(await decideMany(asMember, [x, y] as never, "kept"), { changed: 1, locked: 1 });
  assert.deepEqual(await row(x.id).then((r) => [r.decision, Number(r.decided_by)]), ["passed", admin]);
  assert.deepEqual(await row(y.id).then((r) => [r.decision, Number(r.decided_by)]), ["kept", member]);

  // Clear: the member clears their own call, not the admin's; undecided tracks aren't counted.
  const z = await newTrack();
  assert.deepEqual(await clearDecisions(asMember, [await reread(x.id), await reread(y.id), await reread(z.id)]), { changed: 1, locked: 1 });
  assert.equal((await row(x.id)).decision, "passed");
  assert.equal((await row(y.id)).decision, null);

  // Another desk's track slipped into the list is never changed.
  const theirs = await newTrack(other, otherSender);
  assert.deepEqual(await decideMany(asOwner, [theirs] as never, "kept"), { changed: 0, locked: 1 });
  assert.deepEqual(await clearDecisions(asOwner, [{ id: theirs.id, decision: "kept" }]), { changed: 0, locked: 1 });
  assert.equal((await row(theirs.id)).decision, null);

  // Delete: rows, files queued for removal and activity together, for every track in the batch.
  const [d1, d2] = [await newTrack(), await newTrack()];
  await deleteTracks(asOwner, [d1, d2]);
  for (const d of [d1, d2]) {
    const r = await row(d.id);
    assert.ok(r.deleted_at, "marked deleted");
    assert.equal(r.file_key, null, "audio detached");
  }
  assert.deepEqual((await events("deleted")).map((e) => Number(e.track_id)).sort(), [d1.id, d2.id].sort());
  assert.equal((await row(a.id)).deleted_at, null, "tracks outside the batch stay");
});

test("the batch action has no per-track loop for keep, not for me, clear or delete", () => {
  // Server actions need a signed-in request, so this checks the code path.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/batch.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf('if (type === "kept" || type === "passed")'), src.indexOf("} else {\n    return"));
  assert.doesNotMatch(body, /for \(const t of/);
  assert.match(body, /decideMany\(/);
  assert.match(body, /clearDecisions\(/);
  assert.match(body, /deleteTracks\(/);
});
