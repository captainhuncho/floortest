import { test } from "node:test";
import assert from "node:assert/strict";
import { countsLine, dayLabel, groupLabel, groupSends, isListened, isWaiting } from "../src/lib/sent-groups";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 17, 12); // Tue 17 Nov 2026, noon UTC
const row = (id: string, sentAt: number, listened = false, waiting = false) => ({ id, sentAt, listened, waiting });
const none = { played_at: null, downloaded_at: null, replied_at: null, played_out_at: null };

test("This week is the last 7 days, to the millisecond", () => {
  assert.equal(groupLabel(NOW, NOW), "This week");
  assert.equal(groupLabel(NOW - 7 * DAY + 1, NOW), "This week");
  assert.equal(groupLabel(NOW - 7 * DAY, NOW), "November");
});

test("older sends take their calendar month, with the year only when it isn't this year", () => {
  assert.equal(groupLabel(Date.UTC(2026, 10, 2), NOW), "November");
  assert.equal(groupLabel(Date.UTC(2026, 9, 31, 23, 59), NOW), "October");
  assert.equal(groupLabel(Date.UTC(2026, 7, 18), NOW), "August");
  assert.equal(groupLabel(Date.UTC(2026, 0, 1), NOW), "January");
  assert.equal(groupLabel(Date.UTC(2025, 11, 31, 23, 59), NOW), "December 2025");
  assert.equal(groupLabel(Date.UTC(2025, 10, 17), NOW), "November 2025");
});

test("a send from the last days of December still reads This week in January", () => {
  const jan = Date.UTC(2027, 0, 2);
  assert.equal(groupLabel(Date.UTC(2026, 11, 30), jan), "This week");
  assert.equal(groupLabel(Date.UTC(2026, 11, 20), jan), "December 2026");
});

test("rows keep their order and fall into groups newest first", () => {
  const rows = [row("a", NOW - DAY), row("b", NOW - 2 * DAY), row("c", Date.UTC(2026, 9, 29)), row("d", Date.UTC(2026, 9, 18)), row("e", Date.UTC(2026, 7, 18))];
  const groups = groupSends(rows, "all", NOW);
  assert.deepEqual(groups.map((g) => [g.label, g.rows.map((r) => r.id).join("")]), [["This week", "ab"], ["October", "cd"], ["August", "e"]]);
});

const MIXED = [
  row("heard-week", NOW - DAY, true, false),
  row("waiting-week", NOW - 2 * DAY, false, true),
  row("heard-oct", Date.UTC(2026, 9, 29), true, false),
  row("downloaded-unheard-oct", Date.UTC(2026, 9, 18), false, false),
  row("unheard-90-aug", Date.UTC(2026, 7, 18), false, false),
];

test("All shows every row", () => {
  assert.equal(groupSends(MIXED, "all", NOW).flatMap((g) => g.rows).length, 5);
});

test("Listened keeps only rows that were played, and a group left empty hides", () => {
  const groups = groupSends(MIXED, "listened", NOW);
  assert.deepEqual(groups.map((g) => [g.label, g.rows.map((r) => r.id)]), [["This week", ["heard-week"]], ["October", ["heard-oct"]]]);
});

test("Waiting keeps only delivered rows with nothing after, and hides the other groups", () => {
  const groups = groupSends(MIXED, "waiting", NOW);
  assert.deepEqual(groups.map((g) => [g.label, g.rows.map((r) => r.id)]), [["This week", ["waiting-week"]]]);
});

test("a chip that matches nothing returns no groups", () => {
  assert.deepEqual(groupSends([row("a", NOW, true, false)], "waiting", NOW), []);
  assert.deepEqual(groupSends([], "all", NOW), []);
});

test("Listened is played_at set", () => {
  assert.equal(isListened({ played_at: 1 }), true);
  assert.equal(isListened({ played_at: null }), false);
});

test("Waiting is delivered with nothing after it, and not past the 90 days", () => {
  assert.equal(isWaiting(none, false), true);
  assert.equal(isWaiting(none, true), false, "past 90 days unheard is not waiting");
  assert.equal(isWaiting({ ...none, played_at: 1 }, false), false);
  assert.equal(isWaiting({ ...none, downloaded_at: 1 }, false), false);
  assert.equal(isWaiting({ ...none, replied_at: 1 }, false), false);
  assert.equal(isWaiting({ ...none, played_out_at: 1 }, false), false);
});

test("the counts line is the totals, whatever chip is on", () => {
  assert.equal(countsLine(MIXED), "5 tracks sent · 2 listened to");
  // The chip only narrows what groupSends returns; the line is built from every row.
  assert.equal(groupSends(MIXED, "waiting", NOW).flatMap((g) => g.rows).length, 1);
  assert.equal(countsLine(MIXED), "5 tracks sent · 2 listened to");
  assert.equal(countsLine([row("a", NOW)]), "1 track sent · 0 listened to");
  assert.equal(countsLine([]), "0 tracks sent");
});

test("months are read in the sender's time zone: late on the 31st in UTC+13 is still October there", () => {
  // 31 Oct 2026, 23:30 in Auckland (UTC+13) is 10:30 UTC the same day; an hour later there is 1 Nov, still 31 Oct in UTC.
  const lateOct = Date.UTC(2026, 9, 31, 10, 30);
  const earlyNov = Date.UTC(2026, 9, 31, 11, 30);
  const now = Date.UTC(2026, 10, 20);
  assert.equal(groupLabel(lateOct, now, "Pacific/Auckland"), "October");
  assert.equal(groupLabel(earlyNov, now, "Pacific/Auckland"), "November");
  assert.equal(groupLabel(earlyNov, now, "UTC"), "October");
  // West of UTC it goes the other way: 02:00 UTC on 1 Nov is still the evening of 31 Oct in Los Angeles.
  assert.equal(groupLabel(Date.UTC(2026, 10, 1, 2), now, "America/Los_Angeles"), "October");
  assert.deepEqual(groupSends([row("nov", earlyNov), row("oct", lateOct)], "all", now, "Pacific/Auckland").map((g) => [g.label, g.rows.map((r) => r.id)]), [["November", ["nov"]], ["October", ["oct"]]]);
});

test("the year boundary follows the time zone too", () => {
  // 31 Dec 2025, 12:00 UTC is already 1 Jan 2026 in Auckland.
  const ts = Date.UTC(2025, 11, 31, 12);
  assert.equal(groupLabel(ts, NOW, "UTC"), "December 2025");
  assert.equal(groupLabel(ts, NOW, "Pacific/Auckland"), "January");
});

test("a row's date is weekday, day and short month in the sender's zone, with the year only when it isn't this year", () => {
  assert.equal(dayLabel(Date.UTC(2026, 10, 16, 9), NOW), "Mon 16 Nov");
  assert.equal(dayLabel(Date.UTC(2026, 8, 2, 9), NOW), "Wed 2 Sep");
  assert.equal(dayLabel(Date.UTC(2025, 10, 16, 9), NOW), "Sun 16 Nov 2025");
  assert.equal(dayLabel(Date.UTC(2026, 9, 31, 11, 30), NOW, "Pacific/Auckland"), "Sun 1 Nov");
  assert.equal(dayLabel(Date.UTC(2026, 9, 31, 11, 30), NOW, "UTC"), "Sat 31 Oct");
});
