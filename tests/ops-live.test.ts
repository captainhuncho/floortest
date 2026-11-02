import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoller, freshKeys, LIVE_MIN_MS, liveAgo, liveBlock } from "../src/app/admin/overview/live";

// The Overview's Live card (admin redesign B, step 6): when it asks GET /api/admin/feed, and what it shows. A fake
// clock and fake timers stand in for the browser's, so every wait is exact.

function fakeTimers(start = 1_000_000) {
  let now = start;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      now: () => now,
      set: (fn: () => void, ms: number) => {
        const id = next++;
        due.set(id, { at: now + ms, fn });
        return id;
      },
      clear: (id: unknown) => void due.delete(id as number),
    },
    /** Moves the clock on, running each timer that comes due, in order. */
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const first = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!first || first[1].at > end) break;
        due.delete(first[0]);
        now = first[1].at;
        first[1].fn();
        // Let the ask's promise chain (then/finally) settle before the next timer.
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      now = end;
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    get pending() {
      return [...due.values()].map((d) => d.at - now);
    },
  };
}

const visible = { hidden: false, onScreen: true };

test("poll: every 30 s while visible and on screen, never sooner, one timer at a time", async () => {
  const t = fakeTimers();
  let asks = 0;
  const p = createPoller(async () => void asks++, 5_000, t.timers);
  p.set(visible);
  assert.deepEqual(t.pending, [LIVE_MIN_MS], "an interval under 30 s is raised to 30 s");
  await t.advance(LIVE_MIN_MS - 1);
  assert.equal(asks, 0);
  await t.advance(1);
  assert.equal(asks, 1);
  await t.advance(LIVE_MIN_MS);
  assert.equal(asks, 2);
  assert.equal(t.pending.length, 1, "only ever one timer");
  p.set({ onScreen: true });
  assert.equal(t.pending.length, 1, "setting the same state again doesn't add a timer");
  p.stop();
  assert.equal(t.pending.length, 0);
  await t.advance(5 * LIVE_MIN_MS);
  assert.equal(asks, 2, "stopped for good");
});

test("poll: a hidden tab cancels the timer; visible again, it waits out the rest of the interval (or asks at once)", async () => {
  const t = fakeTimers();
  let asks = 0;
  const p = createPoller(async () => void asks++, LIVE_MIN_MS, t.timers);
  p.set(visible);
  await t.advance(10_000);
  p.set({ hidden: true });
  assert.equal(p.waiting, false, "hidden: no timer at all");
  assert.equal(liveBlock(p.state), "hidden");
  await t.advance(5 * LIVE_MIN_MS);
  assert.equal(asks, 0, "nothing asked while hidden");
  p.set({ hidden: false });
  assert.deepEqual(t.pending, [0], "the interval passed while hidden: ask straight away");
  await t.advance(0);
  assert.equal(asks, 1);

  await t.advance(20_000);
  p.set({ hidden: true });
  p.set({ hidden: false });
  assert.deepEqual(t.pending, [10_000], "back within the interval: only what's left of it");
});

test("poll: Pause, data saver and off-screen each stop it; Resume picks up again", async () => {
  const t = fakeTimers();
  let asks = 0;
  const p = createPoller(async () => void asks++, LIVE_MIN_MS, t.timers);
  p.set(visible);
  for (const block of [{ paused: true }, { saveData: true }, { onScreen: false }] as const) {
    p.set(block);
    assert.equal(p.waiting, false, JSON.stringify(block));
    await t.advance(3 * LIVE_MIN_MS);
    assert.equal(asks, 0, JSON.stringify(block));
    p.set({ paused: false, saveData: false, onScreen: true });
  }
  assert.equal(p.waiting, true, "resumed");
  await t.advance(0);
  assert.equal(asks, 1);
  assert.deepEqual(t.pending, [LIVE_MIN_MS]);
  assert.equal(liveBlock({ paused: true, saveData: true, hidden: true, onScreen: false, stopped: false }), "paused", "Pause is the reason shown first");
});

test("poll: never two asks at once, and a failed ask still schedules the next", async () => {
  const t = fakeTimers();
  let asks = 0;
  let release: () => void = () => {};
  const p = createPoller(
    () => {
      asks++;
      return asks === 1 ? new Promise<void>((r) => (release = r)) : Promise.reject(new Error("offline"));
    },
    LIVE_MIN_MS,
    t.timers,
  );
  p.set(visible);
  await t.advance(LIVE_MIN_MS);
  assert.equal(asks, 1);
  await t.advance(3 * LIVE_MIN_MS);
  p.set({ hidden: true });
  p.set({ hidden: false });
  assert.equal(asks, 1, "still waiting on the first answer: no second ask, no timer");
  assert.equal(p.waiting, false);
  release();
  await t.advance(0);
  assert.deepEqual(t.pending, [LIVE_MIN_MS], "the next is timed from the answer");
  await t.advance(LIVE_MIN_MS);
  assert.equal(asks, 2);
  assert.deepEqual(t.pending, [LIVE_MIN_MS], "the failure is swallowed and the next one is still timed");
});

test("rows: only the new ones fade in, and the times are short and zone-free", () => {
  const a = { kind: "signup" as const, text: "Mira @mira", ref: "1", created_at: 1, href: "/admin/accounts/1" };
  const b = { kind: "admin" as const, text: "suspended · @x", ref: "", created_at: 2, href: "/admin/log" };
  const c = { ...b, text: "approved plan · @y" };
  assert.deepEqual([...freshKeys([a, b], [c, a, b])], ["admin::2:approved plan · @y"], "same time, different action: still new");
  assert.equal(freshKeys([a], [a]).size, 0);
  const now = 1_800_000_000_000;
  assert.equal(liveAgo(now - 20_000, now), "now");
  assert.equal(liveAgo(now + 5_000, now), "now", "a clock a little behind the server never shows a negative time");
  assert.equal(liveAgo(now - 4 * 60_000, now), "4 min");
  assert.equal(liveAgo(now - 2 * 3_600_000 - 1, now), "2 h");
  assert.equal(liveAgo(now - 3 * 86_400_000, now), "3 d");
});
