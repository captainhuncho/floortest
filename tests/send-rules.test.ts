import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_TYPES, receiverAsksPlayChoice } from "../src/lib/account-types";

test("only Label and A&R desks (and the retired label_radio) ask the sender whether a track may be played", () => {
  const asks = Object.keys(ACCOUNT_TYPES).filter((k) => receiverAsksPlayChoice(k));
  assert.deepEqual(asks.sort(), ["ar", "label"]);
  assert.equal(receiverAsksPlayChoice("label_radio"), true);
  for (const k of ["dj", "producer_dj", "radio", "artist", "curator", "music_pro", null, undefined, ""]) assert.equal(receiverAsksPlayChoice(k), false, String(k));
});
