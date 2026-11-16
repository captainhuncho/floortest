import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_TYPES, receiverAsksPlayChoice } from "../src/lib/account-types";

test("only Label and A&R desks (and the retired label_radio) ask the sender whether a track may be played", () => {
  const asks = Object.keys(ACCOUNT_TYPES).filter((k) => receiverAsksPlayChoice(k));
  assert.deepEqual(asks.sort(), ["ar", "label"]);
  assert.equal(receiverAsksPlayChoice("label_radio"), true);
  for (const k of ["dj", "producer_dj", "radio", "artist", "curator", "music_pro", null, undefined, ""]) assert.equal(receiverAsksPlayChoice(k), false, String(k));
});

test("a send to a Label or A&R desk is evaluation only unless the sender chose OK to play; any other desk may play it", async () => {
  process.env.DATA_DIR ??= (await import("./test-db")).testDataDir("ft-send-rules-");
  process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
  delete process.env.DATABASE_URL;
  const { readSubmission } = await import("../src/lib/submission");
  const base = { name: "S", email: "s@example.test", title: "T", artist: "A", genre: "House", fileName: "t.wav", size: 1000, release_status: "unsigned", mix_status: "mastered", ai_use: "none", sender_instagram: "@s" };
  const desk = (kind: string) => ({ id: 1, kind, plan: "pro", email_verified_at: 1 }) as never;
  const setsOk = async (kind: string, extra: object) => {
    const r = await readSubmission({ ...base, ...extra }, desk(kind), null);
    assert.ok(!("error" in r), JSON.stringify(r));
    return (r as { meta: { setsOk?: boolean } }).meta.setsOk;
  };
  for (const kind of ["label", "ar"]) {
    assert.equal(await setsOk(kind, {}), false, `${kind}: evaluation only by default`);
    assert.equal(await setsOk(kind, { play: "evaluation" }), false);
    assert.equal(await setsOk(kind, { play: "ok_to_play" }), true, `${kind}: the sender's OK to play`);
    assert.equal(await setsOk(kind, { sets_ok: true }), false, `${kind}: the old field is ignored`);
  }
  for (const kind of ["dj", "producer_dj", "radio", "artist", "curator", "music_pro"]) {
    assert.equal(await setsOk(kind, {}), true, `${kind}: sending means it may be played`);
    assert.equal(await setsOk(kind, { play: "evaluation" }), true, `${kind}: no choice to make`);
  }
});
