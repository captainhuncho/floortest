import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ANSWERS, firstOpenStep, fromStored, initials, progressOf, stepForError, stepIssue, toStored } from "../src/lib/signup-flow";

const full = { ...EMPTY_ANSWERS, first_name: "Nia", last_name: "Fresh", handle: "nia-fresh", kind: "dj", email: "nia@example.test" };

test("each step names the first thing missing, the way the server would", () => {
  assert.deepEqual(stepIssue(2, EMPTY_ANSWERS), { field: "first_name", text: "Add your first name." });
  assert.deepEqual(stepIssue(2, { ...EMPTY_ANSWERS, first_name: "Nia" }), { field: "last_name", text: "Add your surname." });
  assert.equal(stepIssue(2, full), null);
  assert.equal(stepIssue(3, { ...full, handle: "" })?.text, "Choose a username.");
  assert.equal(stepIssue(3, { ...full, handle: "a" })?.field, "handle");
  assert.equal(stepIssue(3, { ...full, handle: "-nope" })?.field, "handle");
  assert.equal(stepIssue(3, full), null);
  assert.equal(stepIssue(4, { ...full, kind: "producer" })?.text, "Pick one.", "only the real account types");
  assert.equal(stepIssue(4, full), null);
  assert.equal(stepIssue(5, { ...full, email: "nia" })?.field, "email");
  assert.equal(stepIssue(5, full, { password: "short", agree: true })?.text, "At least 8 characters.");
  assert.equal(stepIssue(5, full, { password: "Correct-Horse-Battery-77" })?.field, "agree");
  assert.equal(stepIssue(5, full, { password: "Correct-Horse-Battery-77", agree: true }), null);
});

test("a reload or deep link never skips an unanswered question", () => {
  assert.equal(firstOpenStep(EMPTY_ANSWERS, 5), 2);
  assert.equal(firstOpenStep({ ...full, kind: "" }, 5), 4);
  assert.equal(firstOpenStep(full, 5), 5);
  assert.equal(firstOpenStep(EMPTY_ANSWERS, 2), 2);
});

test("server answers land on the step whose field is wrong; the no-enumeration answer stays on the last step", () => {
  assert.equal(stepForError("That link is taken."), 3);
  assert.equal(stepForError("Link names use 2–30 letters, numbers, - or _."), 3);
  assert.equal(stepForError("That link name is reserved."), 3);
  assert.equal(stepForError("That name is protected for a well-known artist. If it's you, contact us and we'll set it up."), 3);
  assert.equal(stepForError("Fill in your first name, surname, username and email."), 2);
  assert.equal(stepForError("We couldn't create an account with those details. If you already have one, log in or reset your password. Otherwise, try a different link name."), 5);
  assert.equal(stepForError("Enter a valid email."), 5);
  assert.equal(stepForError("Too many sign-ups from this connection. Try again later."), 5);
});

test("sessionStorage keeps the answers and never the password", () => {
  const raw = toStored({ ...full, updates: true, password: "Correct-Horse-Battery-77", agree: true } as typeof full & Record<string, unknown>, 4);
  assert.ok(!raw.includes("Correct-Horse"), "the password is never written");
  assert.ok(!raw.includes("password"));
  assert.ok(!raw.includes("agree"));
  const back = fromStored(raw);
  assert.equal(back?.step, 4);
  assert.deepEqual(back?.answers, { ...full, updates: true, offers: false });
});

test("stored answers are read defensively", () => {
  assert.equal(fromStored(null), null);
  assert.equal(fromStored("{not json"), null);
  assert.equal(fromStored("42"), null);
  const odd = fromStored(JSON.stringify({ step: 99, handle: "Bad Name!", password: "x", first_name: 7 }));
  assert.equal(odd?.step, 1);
  assert.equal(odd?.answers.handle, "bad-name");
  assert.equal("password" in (odd?.answers ?? {}), false);
  assert.equal(odd?.answers.first_name, undefined);
});

test("progress and initials", () => {
  assert.equal(progressOf(1), 0);
  assert.equal(progressOf(2), 1);
  assert.equal(progressOf(8), 7);
  assert.equal(initials("maxwell", "Adjavon"), "MA");
  assert.equal(initials("", ""), "");
});
