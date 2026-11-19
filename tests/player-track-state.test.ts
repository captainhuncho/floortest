import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-player-state-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("player track state: this desk's live tracks only, named fields, never an email", async () => {
  const { q } = await import("../src/lib/db");
  const { playerTrackState } = await import("../src/lib/desk");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id",
      `${handle}@ps.io`, handle, handle, now, now,
    ))!.id;
  const a = await user("psdesk");
  const b = await user("psother");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'secret@send.io', '  Ama Kwarteng Boateng ', ?) RETURNING id", a, now))!.id;
  const track = async (desk: number, tok: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?, ?, 'T', 'A', ?, 'audio/x.wav', 'x.wav', 'audio/wav', 1, ?) RETURNING id",
      desk, sender, tok, now,
    ))!.id;
  const kept = await track(a, "tok-ps1");
  await q.run("UPDATE tracks SET decision = 'kept', decided_at = ?, sets_ok = 1, played_out_at = NULL WHERE id = ?", now, kept);
  const evalOnly = await track(a, "tok-ps2");
  await q.run("UPDATE tracks SET decision = 'kept', decided_at = ?, sets_ok = 0, played_out_at = ? WHERE id = ?", now, now, evalOnly);
  const deleted = await track(a, "tok-ps3");
  await q.run("UPDATE tracks SET deleted_at = ? WHERE id = ?", now, deleted);

  const desk = { id: a, actor_id: a };
  const s = await playerTrackState(desk, kept);
  assert.deepEqual(s, { setsOk: true, playedOutAt: null, kept: true, sender: "Ama" });
  assert.ok(!JSON.stringify(s).includes("@") && !JSON.stringify(s).includes("Kwarteng"), "first name only, no email");
  assert.deepEqual(await playerTrackState(desk, evalOnly), { setsOk: false, playedOutAt: now, kept: true, sender: "Ama" });

  assert.equal(await playerTrackState(desk, deleted), undefined, "deleted: nothing");
  assert.equal(await playerTrackState({ id: b, actor_id: b }, kept), undefined, "another desk: nothing");
  assert.equal(await playerTrackState({ id: a, actor_id: b }, kept), undefined, "the per-person rules hold even if the desk id is faked");
  // A Projects track reaches the player with a negative id (Player.tsx), so it never matches a desk track: nothing.
  assert.equal(await playerTrackState(desk, -kept), undefined, "a Projects (negative) id: nothing");
  for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) assert.equal(await playerTrackState(desk, bad), undefined);
});

test("the player state action returns nothing in ops View as, and checks the desk first otherwise", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/review.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function playerTrackState"), src.indexOf("/** Kept tracks only"));
  assert.match(fn, /if \(await viewingAs\(\)\) return null;[\s\S]*await requireUser\(\)/, "View as first, then sign-in");
  assert.match(fn, /trackStateFor\(u, Number\(trackId\)\)/);
  assert.match(fn, /if \(!canMarkPlayedOut\(u\)\) return null;[\s\S]*trackStateFor/, "nothing for anyone who can't mark played out");
});
