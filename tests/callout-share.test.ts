import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cardCaption, cardProblem } from "../src/app/dashboard/collections/callout-card";

test("the caption carries the callout name and the exact link printed on the card", () => {
  const caption = cardCaption("Villagers", "https://floortest.app/nadia");
  assert.equal(caption, "Sending me music for Villagers? Send the track here: https://floortest.app/nadia. You'll know when I've listened.");
  assert.ok(!caption.includes("!"));
});

test("a callout that can't be shared says why and offers no retry", () => {
  for (const reason of ["closed", "full", "paused", "unavailable"]) {
    const p = cardProblem(409, reason, null);
    assert.equal(p.canRetry, false);
    assert.ok(p.message.length > 0);
  }
});

test("an unknown refusal reason falls back to the general message", () => {
  assert.equal(cardProblem(409, "something-new", null).message, cardProblem(409, "unavailable", null).message);
  assert.equal(cardProblem(409, null, null).message, cardProblem(409, "unavailable", null).message);
});

test("too many requests gives the wait from Retry-After, rounded up to minutes", () => {
  const p = cardProblem(429, null, "90");
  assert.equal(p.canRetry, true);
  assert.match(p.message, /in 2 min/);
  assert.match(cardProblem(429, null, null).message, /soon/);
});

test("an unverified email is told what to do; any other failure can be retried", () => {
  assert.deepEqual(cardProblem(403, null, null), { message: "Verify your email to share a card.", canRetry: false });
  assert.equal(cardProblem(500, null, null).canRetry, true);
  assert.equal(cardProblem(404, null, null).canRetry, true);
});
