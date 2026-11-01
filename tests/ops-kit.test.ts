import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanTag,
  keyName,
  matchShortcut,
  namesShown,
  peopleQuery,
  rankCommands,
  selectRange,
  shortcutAllowed,
  toggleOne,
} from "../src/app/admin/kit/core";

// The ops kit's plain rules (admin redesign B, step 1), ported from the prototype kit's behaviour checks.

test("tags: trimmed, first word only, never empty from stray commas", () => {
  assert.equal(cleanTag(", VIP, ,vip "), "vip");
  assert.equal(cleanTag(",,, "), "");
  assert.equal(cleanTag("  beta-2 "), "beta-2");
  assert.equal(cleanTag("Beta Two"), "beta", "a space ends the tag, as the server keeps it");
  assert.equal(cleanTag("é!!x"), "x");
  assert.equal(cleanTag("a".repeat(40)).length, 30);
});

test("single-key shortcuts stay off in fields, under dialogs and with modifier keys", () => {
  const base = { key: "j", inField: false, dialogOpen: false };
  assert.equal(shortcutAllowed(base), true);
  assert.equal(shortcutAllowed({ ...base, inField: true }), false, "typing j in a field types j");
  assert.equal(shortcutAllowed({ ...base, dialogOpen: true }), false, "nothing acts under a dialog or the palette");
  assert.equal(shortcutAllowed({ ...base, metaKey: true }), false, "⌘J belongs to the browser");
  assert.equal(shortcutAllowed({ ...base, ctrlKey: true }), false);
  assert.equal(shortcutAllowed({ ...base, altKey: true }), false);
  assert.equal(shortcutAllowed({ ...base, defaultPrevented: true }), false, "a press another handler took");
  assert.equal(shortcutAllowed({ ...base, key: "ArrowDown" }), false, "arrows are the focused row's, not global");
  assert.equal(shortcutAllowed({ ...base, key: "Escape" }), true);
  assert.equal(keyName("J", true), "J");
  assert.equal(keyName("Escape"), "escape");
});

test("two-key sequences wait for the second key, and give up after a pause", () => {
  const combos = ["g i", "g u", "j"];
  assert.deepEqual(matchShortcut(combos, "g", "", 0), { run: null, pending: "g" });
  assert.deepEqual(matchShortcut(combos, "i", "g", 200), { run: "g i", pending: "" });
  assert.deepEqual(matchShortcut(combos, "i", "g", 5000), { run: null, pending: "" }, "too slow: i alone does nothing");
  assert.deepEqual(matchShortcut(combos, "j", "g", 200), { run: "j", pending: "" }, "a key that isn't a follow-up still works");
  assert.deepEqual(matchShortcut(combos, "q", "", 0), { run: null, pending: "" });
});

test("shift-click selects the range from the anchor, either direction, within the bulk limit", () => {
  const ids = [10, 11, 12, 13, 14, 15];
  assert.deepEqual([...selectRange(new Set<number>(), ids, 1, 4, true)].sort(), [11, 12, 13, 14]);
  assert.deepEqual([...selectRange(new Set<number>(), ids, 4, 1, true)].sort(), [11, 12, 13, 14], "upwards too");
  assert.deepEqual([...selectRange(new Set([10, 15]), ids, 1, 2, true)].sort(), [10, 11, 12, 15], "rows outside the range keep their state");
  assert.deepEqual([...selectRange(new Set(ids), ids, 2, 3, false)].sort(), [10, 11, 14, 15], "shift-click on a picked row clears the range");
  assert.equal(selectRange(new Set<number>(), ids, 0, 5, true, 3).size, 3, "never past the server's limit");
  assert.equal(toggleOne(new Set([1, 2]), 3, 2).size, 2, "one more past the limit is refused");
  assert.deepEqual([...toggleOne(new Set([1, 2]), 2, 2)], [1]);
});

test("a confirm names the first eight, then says how many more", () => {
  const names = Array.from({ length: 11 }, (_, i) => `@p${i}`);
  const { shown, more } = namesShown(names);
  assert.equal(shown.length, 8);
  assert.equal(more, 3);
  assert.deepEqual(namesShown(["@a"]), { shown: ["@a"], more: 0 });
});

test("⌘K: commands rank by label, then keywords; people search needs two characters", () => {
  const cmds = [
    { id: "a", label: "Users", keywords: ["people"] },
    { id: "b", label: "Feedback", keywords: ["beta"] },
    { id: "c", label: "Feature use", keywords: [] },
  ];
  assert.deepEqual(rankCommands("fe", cmds).map((c) => c.id), ["b", "c"]);
  assert.deepEqual(rankCommands("people", cmds).map((c) => c.id), ["a"]);
  assert.deepEqual(rankCommands("zzz", cmds), []);
  assert.equal(rankCommands("", cmds).length, 3, "empty lists the first ones");
  assert.equal(peopleQuery("l"), null);
  assert.equal(peopleQuery(" @l "), null, "the @ doesn't count");
  assert.equal(peopleQuery("@le"), "le");
  assert.equal(peopleQuery("x".repeat(300))!.length, 100);
});
