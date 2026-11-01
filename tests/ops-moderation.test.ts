import { test } from "node:test";
import assert from "node:assert/strict";
import { ageWords, filterCounts, matches, nextKeyAfter, playableKind, signalWords, stepKey, visibleRows, type QueueRow } from "../src/app/admin/moderation/queue/model";
import { keyLabel, shortcutAllowed } from "../src/app/admin/kit/core";

// The new Moderation (admin redesign B, step 4): a queue of tracks with a real signal, worded plainly, filtered by
// kind, played only on an open takedown claim, and moving to the next row after Keep or Remove.

const row = (key: string, kind: QueueRow["kind"], extra: Partial<QueueRow> = {}): QueueRow => ({
  key,
  kind,
  track_id: kind === "late_scan" ? null : Number(key.replace(/\D/g, "")) || 1,
  title: `Title ${key}`,
  artist: "Artist",
  receiver: "max",
  sender: "Sam Sender",
  email: "sam@example.com",
  token: `tok-${key}`,
  age: "5 min",
  words: "",
  detail: "",
  reviewedBy: null,
  ...extra,
});

test("signal words: what each signal says, in plain words (no flag or report wording)", () => {
  assert.equal(signalWords({ kind: "takedown", who: "Atlas Publishing", count: 1, handle: "max" }).words, "Takedown claim by Atlas Publishing");
  assert.equal(signalWords({ kind: "blocked_sender", who: "spam@x.io", count: 3, handle: "max" }).words, "Blocked by 3 receivers");
  assert.equal(signalWords({ kind: "blocked_sender", who: "spam@x.io", count: 1, handle: "max" }).words, "Blocked by 1 receiver");
  assert.equal(signalWords({ kind: "late_scan", who: "s@x.io", count: 1, handle: "max" }).words, "Scanner checked it late");
  assert.match(signalWords({ kind: "late_scan", who: "s@x.io", count: 1, handle: "max" }).detail, /from s@x\.io to @max/);
  assert.equal(signalWords({ kind: null, who: "", count: 1, handle: "max" }).words, "No signals");
  for (const kind of ["takedown", "blocked_sender", "late_scan", null] as const) {
    const w = signalWords({ kind, who: "x", count: 2, handle: "h" });
    assert.doesNotMatch(`${w.words} ${w.detail}`, /\b(flag|flagged|report|reported)\b/i);
  }
});

test("ages: minutes, hours, then days", () => {
  assert.equal(ageWords(10_000), "1 min");
  assert.equal(ageWords(25 * 60_000), "25 min");
  assert.equal(ageWords(3 * 3_600_000), "3 h");
  assert.equal(ageWords(3 * 86_400_000), "3 d");
});

test("filter counts follow the typed query; each tab lists its own signal", () => {
  const rows = [row("t1", "takedown"), row("b2", "blocked_sender", { title: "Night Bus" }), row("b3", "blocked_sender"), row("l4", "late_scan")];
  assert.deepEqual(filterCounts(rows, ""), { all: 4, takedown: 1, blocked_sender: 2, late_scan: 1 });
  assert.deepEqual(filterCounts(rows, "night"), { all: 1, takedown: 0, blocked_sender: 1, late_scan: 0 });
  assert.deepEqual(visibleRows(rows, "blocked_sender", "").map((r) => r.key), ["b2", "b3"]);
  assert.deepEqual(visibleRows(rows, "all", "").map((r) => r.key), ["t1", "b2", "b3", "l4"], "newest first, as the server sent them");
  // Search by sender email or the whole receipt token, not part of a token.
  assert.ok(matches(rows[0], "SAM@example"));
  assert.ok(matches(rows[0], "tok-t1"));
  assert.ok(!matches(rows[0], "tok-"));
});

test("listening: only a takedown claim plays", () => {
  assert.equal(playableKind("takedown"), true);
  assert.equal(playableKind("blocked_sender"), false);
  assert.equal(playableKind("late_scan"), false);
  assert.equal(playableKind(null), false);
});

test("after Keep or Remove: the row below opens, or the one above at the end, or none", () => {
  const keys = ["a", "b", "c"];
  assert.equal(nextKeyAfter(keys, "a"), "b");
  assert.equal(nextKeyAfter(keys, "b"), "c");
  assert.equal(nextKeyAfter(keys, "c"), "b");
  assert.equal(nextKeyAfter(["a"], "a"), null);
  assert.equal(nextKeyAfter(keys, "gone"), "a");
  assert.equal(nextKeyAfter([], "a"), null);
});

test("j / k: one row at a time, staying at the ends", () => {
  const keys = ["a", "b", "c"];
  assert.equal(stepKey(keys, "a", 1), "b");
  assert.equal(stepKey(keys, "c", 1), "c");
  assert.equal(stepKey(keys, "a", -1), "a");
  assert.equal(stepKey(keys, null, 1), "a");
  assert.equal(stepKey([], "a", 1), null);
});

test("space: a shortcut only when no button or link has focus, and the list calls it Space", () => {
  assert.equal(shortcutAllowed({ key: " ", inField: false, dialogOpen: false }), true);
  assert.equal(shortcutAllowed({ key: " ", inField: false, dialogOpen: false, onControl: true }), false);
  assert.equal(shortcutAllowed({ key: "a", inField: false, dialogOpen: false, onControl: true }), true, "letters still work on a focused row");
  assert.equal(keyLabel(" "), "Space");
  assert.equal(keyLabel("j"), "j");
});
