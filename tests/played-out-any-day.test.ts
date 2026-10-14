import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-played-out-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const DAY = 86_400_000;
// Wednesday 14 Oct 2026, noon UTC: the Monday prompt is closed, the pick page isn't.
const WED = Date.UTC(2026, 9, 14, 12);

async function desk(handle: string, kind: "dj" | "label_radio") {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, kind, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?, ?) RETURNING id",
    `${handle}@x.io`, handle, handle, kind, WED, WED,
  ))!.id;
}

async function kept(userId: number, title: string, decidedAt: number, setsOk: boolean, playedOut = false) {
  const { q } = await import("../src/lib/db");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", userId, `${title}@s.io`, WED))!.id;
  return (await q.get<{ id: number }>(
    `INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at, sets_ok, played_out_at)
     VALUES (?,?,?,'A',?,?,'u.wav','audio/wav',1,?, 'kept', ?, ?, ?) RETURNING id`,
    userId, sender, title, `tok-${title}`, `audio/${title}.wav`, decidedAt, decidedAt, setsOk ? 1 : 0, playedOut ? decidedAt : null,
  ))!.id;
}

test("the pick page lists the last 14 days' kept tracks on any day; the Monday prompt stays Monday and Tuesday", async () => {
  const { playedOutPicks, playedOutPrompt } = await import("../src/lib/played-out-prompt");
  const dj = await desk("anyday", "dj");
  await kept(dj, "recent", WED - 2 * DAY, true);
  await kept(dj, "tenDays", WED - 10 * DAY, true);
  await kept(dj, "old", WED - 20 * DAY, true);
  await kept(dj, "evalOnly", WED - 1 * DAY, false);
  await kept(dj, "done", WED - 1 * DAY, true, true);

  const picks = await playedOutPicks({ id: dj, kind: "dj" }, WED);
  assert.ok(picks);
  assert.deepEqual(picks.tracks.map((t) => t.title), ["recent", "tenDays"], "newest first, 14 days back, not yet played out");
  assert.deepEqual(picks.heldBack, ["evalOnly"], "evaluation-only tracks are named, not listed");
  assert.equal(await playedOutPrompt({ id: dj, kind: "dj", tz: "UTC" }, WED), null, "no Floor prompt on a Wednesday");

  // Members and non-DJ desks don't mark Played out.
  assert.equal(await playedOutPicks({ id: dj, kind: "dj", role: "member" }, WED), null);
  const label = await desk("label", "label_radio");
  assert.equal(await playedOutPicks({ id: label, kind: "label_radio" }, WED), null);
});

test("Prepare can mark any kept track the sender cleared for sets, once", async () => {
  const { q } = await import("../src/lib/db");
  const { markableOnPrepare, playedOutStatus } = await import("../src/lib/played-out-prompt");
  const { markPlayedOut } = await import("../src/lib/review");
  const dj = await desk("prepare", "dj");
  const cleared = await kept(dj, "cleared", WED - 30 * DAY, true);
  const evalOnly = await kept(dj, "evalonly2", WED - 1 * DAY, false);
  const track = async (id: number) => (await q.get<import("../src/lib/db").Track>("SELECT * FROM tracks WHERE id = ?", id))!;

  assert.equal(markableOnPrepare(await track(cleared)), true, "older than 14 days is still markable from Prepare");
  assert.equal(markableOnPrepare(await track(evalOnly)), false, "evaluation only: ask first");

  const user = (await q.get<import("../src/lib/db").User>("SELECT * FROM users WHERE id = ?", dj))!;
  assert.equal(await markPlayedOut(user, await track(cleared), ""), true);
  assert.equal(markableOnPrepare(await track(cleared)), false, "once only");

  const status = await playedOutStatus(dj, [cleared, evalOnly]);
  assert.ok(status[cleared].at);
  assert.equal(status[cleared].setsOk, true);
  assert.deepEqual(status[evalOnly], { at: null, note: "", setsOk: false });
  assert.deepEqual(await playedOutStatus(dj + 999, [cleared]), {}, "another desk's tracks stay hidden");
});
