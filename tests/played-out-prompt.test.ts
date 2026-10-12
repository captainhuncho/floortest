import assert from "node:assert/strict";
import { test } from "node:test";
import { promptWeek } from "../src/lib/played-out-prompt";

const H = 3_600_000;

test("the Monday prompt follows the receiver's own week and time zone", () => {
  // Monday 12 Oct 2026, 10:00 in Lagos (UTC+1): open, asks about Mon 5 to Sun 11 Oct, Lagos midnight to midnight.
  const lagos = promptWeek("Africa/Lagos", Date.UTC(2026, 9, 12, 9));
  assert.deepEqual(lagos, { open: true, tuesday: false, key: "2026-10-12", from: Date.UTC(2026, 9, 5) - H, to: Date.UTC(2026, 9, 12) - H });
  // Tuesday is still open, with the same week; Wednesday is closed.
  assert.equal(promptWeek("Africa/Lagos", Date.UTC(2026, 9, 13, 20)).key, "2026-10-12");
  assert.equal(promptWeek("Africa/Lagos", Date.UTC(2026, 9, 13, 8)).tuesday, true);
  assert.equal(promptWeek("Africa/Lagos", Date.UTC(2026, 9, 14, 9)).open, false);
  // Sunday 23:30 in London (BST, UTC+1) is 22:30 UTC: still Sunday there, so no prompt yet.
  assert.equal(promptWeek("Europe/London", Date.UTC(2026, 9, 11, 22, 30)).open, false);
  // 00:30 Monday in London: open.
  assert.equal(promptWeek("Europe/London", Date.UTC(2026, 9, 11, 23, 30)).open, true);
  // A bad time zone falls back to UTC instead of failing.
  assert.equal(promptWeek("Not/AZone", Date.UTC(2026, 9, 12, 9)).key, "2026-10-12");
});
