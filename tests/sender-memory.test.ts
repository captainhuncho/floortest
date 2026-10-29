import { test } from "node:test";
import assert from "node:assert/strict";
import { recallSender, rememberSender, SENDER_TTL_MS } from "../src/lib/sender-memory";

// Hardening H11 (29 Oct): on a shared computer, the next person on a send page shouldn't find the last sender's details.
const me = { name: "Kwame", email: "k@example.com", instagram: "@k", streaming: "" };

test("a sender's details are remembered for a short while, then forgotten", () => {
  const t = 1_700_000_000_000;
  const saved = rememberSender(me, t);
  assert.deepEqual(recallSender(saved, t + 60_000), me);
  assert.deepEqual(recallSender(saved, t + SENDER_TTL_MS - 1), me);
  assert.equal(recallSender(saved, t + SENDER_TTL_MS + 1), null, "past the time limit");
  assert.ok(SENDER_TTL_MS <= 24 * 3_600_000, "no longer than a day");
});

test("details saved before the time limit existed, or damaged, are not used", () => {
  assert.equal(recallSender(JSON.stringify(me), Date.now()), null, "no saved time");
  assert.equal(recallSender("not json", Date.now()), null);
  assert.equal(recallSender("", Date.now()), null);
  assert.equal(recallSender(rememberSender(me, Date.now() + 3_600_000), Date.now()), null, "a time in the future");
});
