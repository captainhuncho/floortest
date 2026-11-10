import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cardCaption, cardProblem, shareCardTarget } from "../src/app/dashboard/collections/callout-card";

test("the caption carries the callout name and the exact link printed on the card", () => {
  const caption = cardCaption("Villagers", "https://floortest.app/nadia");
  assert.equal(caption, "Sending me music for Villagers? Send the track here: https://floortest.app/nadia. You'll know when I've listened.");
  assert.ok(!caption.includes("!"));
});

test("a callout that can't be shared says why and offers no retry", () => {
  for (const reason of ["closed", "full", "paused", "unavailable", "invite-only"]) {
    const p = cardProblem(409, reason, null);
    assert.equal(p.canRetry, false);
    assert.ok(p.message.length > 0);
  }
});

test("behind the site password the sheet says cards are off while invite-only", () => {
  const { message } = cardProblem(409, "invite-only", null);
  assert.equal(message, "Cards are off while FloorTest is invite-only. Share the link instead.");
  assert.ok(!message.includes("!"));
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

test("the link's Share offers a card only for the owner's open receiving callout, never in a staff view", () => {
  const active = { id: 7, name: "Villagers" };
  const base = { isOwner: true, viewingAs: false, active, blocked: false };
  assert.deepEqual(shareCardTarget(base), { collectionId: 7, collectionName: "Villagers" });
  assert.equal(shareCardTarget({ ...base, isOwner: false }), undefined);
  assert.equal(shareCardTarget({ ...base, viewingAs: true }), undefined);
  assert.equal(shareCardTarget({ ...base, active: null }), undefined);
  assert.equal(shareCardTarget({ ...base, active: undefined }), undefined);
  assert.equal(shareCardTarget({ ...base, blocked: true }), undefined);
});
