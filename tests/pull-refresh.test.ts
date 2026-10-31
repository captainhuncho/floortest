import assert from "node:assert/strict";
import { test } from "node:test";
import { DEAD_ZONE, HOLD, IDLE, RESIST, SETTLE_MS, TRIGGER, pullView, reducePull, restingAtTop, type PullEvent, type PullState } from "../src/lib/pull-refresh";

const run = (events: PullEvent[], from: PullState = IDLE) => events.reduce(reducePull, from);
const start = (ready = true): PullEvent => ({ type: "start", source: "touch", x: 100, y: 100, ready });
const to = (dy: number, dx = 0): PullEvent => ({ type: "move", x: 100 + dx, y: 100 + dy, atTop: true });
/** Finger travel that gives this much (resisted) pull. */
const travel = (pull: number) => Math.ceil(pull / RESIST);

test("starts only after the page has rested at the top", () => {
  assert.equal(restingAtTop(0, 10_000, 10_000 - SETTLE_MS), true);
  assert.equal(restingAtTop(0, 10_000, 10_000 - 100), false, "a scroll that just reached the top doesn't count");
  assert.equal(restingAtTop(4, 10_000, 0), false, "not at the top");
  assert.equal(run([start(false), to(travel(TRIGGER + 40)), { type: "end" }]).phase, "idle");
});

test("nothing shows inside the dead zone", () => {
  const s = run([start(), to(travel(DEAD_ZONE) - 4)]);
  assert.equal(s.phase, "tracking");
  assert.equal(pullView(s).ring, false);
  assert.equal(pullView(s).offset, 0);
  const past = run([start(), to(travel(DEAD_ZONE) + 4)]);
  assert.equal(past.phase, "pulling");
  assert.equal(pullView(past).ring, true);
  assert.ok(pullView(past).offset > 0, "the page stretches with the pull");
});

test("the pull resists: about a quarter of a phone screen to arm", () => {
  assert.equal(run([start(), to(200)]).phase, "pulling");
  assert.equal(run([start(), to(travel(TRIGGER))]).phase, "armed");
  assert.ok(travel(TRIGGER) >= 211, "844px phone / 4");
});

test("a sideways swipe cancels it", () => {
  assert.equal(run([start(), to(2, 14), to(travel(TRIGGER) + 10, 14)]).phase, "idle", "sideways first");
  assert.equal(run([start(), to(travel(DEAD_ZONE) + 10), to(travel(DEAD_ZONE) + 20, 120)]).phase, "idle", "drifting sideways later");
});

test("pulling arms it, pulling back up disarms it", () => {
  const armed = run([start(), to(travel(TRIGGER) + 20)]);
  assert.equal(armed.phase, "armed");
  assert.equal(pullView(armed).flipped, true, "the arrow flips when armed");
  const back = reducePull(armed, to(travel(TRIGGER) - 60));
  assert.equal(back.phase, "pulling");
  assert.equal(pullView(back).flipped, false);
  assert.equal(reducePull(back, { type: "end" }).phase, "idle", "released after pulling back: springs back, no refresh");
});

test("the release refreshes, and the page holds while the ring spins", () => {
  const s = run([start(), to(travel(TRIGGER) + 20), { type: "end" }]);
  assert.equal(s.phase, "refreshing");
  assert.deepEqual([pullView(s).offset, pullView(s).spinning], [HOLD, true]);
  assert.equal(reducePull(s, { type: "done" }).phase, "idle");
});

test("holding never refreshes", () => {
  let s = run([start(), to(travel(TRIGGER) + 20)]);
  for (let i = 0; i < 50; i++) s = reducePull(s, to(travel(TRIGGER) + 20));
  assert.equal(s.phase, "armed", "still only armed, however long it's held");
});

test("a scroll during the pull cancels it", () => {
  assert.equal(run([start(), to(travel(TRIGGER) + 20), { type: "move", x: 100, y: 400, atTop: false }]).phase, "idle");
});

test("a touch that is cancelled (system gesture) never refreshes", () => {
  assert.equal(run([start(), to(travel(TRIGGER) + 20), { type: "cancel" }, { type: "end" }]).phase, "idle");
});

test("mouse: press, drag down, release refreshes; a click does nothing", () => {
  const press: PullEvent = { type: "start", source: "mouse", x: 100, y: 100, ready: true };
  assert.equal(run([press, to(260), { type: "end" }]).phase, "refreshing");
  assert.equal(run([press, { type: "end" }]).phase, "idle");
});

const wheelUp = (fresh = false, ready = true): PullEvent => ({ type: "wheel", deltaY: -40, ready, atTop: true, fresh });

test("trackpad: overscrolling only arms it, and the wheel going quiet offers the button, never a refresh", () => {
  let s = reducePull(IDLE, wheelUp(true));
  for (let i = 0; i < 30; i++) s = reducePull(s, wheelUp());
  assert.equal(s.phase, "armed");
  s = reducePull(s, { type: "wheelIdle" });
  assert.equal(s.phase, "offer");
  assert.equal(pullView(s).offer, true);
  assert.equal(pullView(s).offset, 0, "the page springs back while the button shows");
  assert.equal(reducePull(s, { type: "offerTimeout" }).phase, "idle", "the button goes away after a few seconds");
  assert.equal(reducePull(s, { type: "cancel" }).phase, "offer", "pressing the button doesn't take it away");
  assert.equal(reducePull(s, { type: "offerClick" }).phase, "refreshing", "only a click refreshes");
});

test("trackpad: a short overscroll springs back with no button", () => {
  const s = run([wheelUp(true), wheelUp(), { type: "wheelIdle" }]);
  assert.equal(s.phase, "idle");
});

test("trackpad: scrolling up to the top never arms it", () => {
  let s = reducePull(IDLE, wheelUp(true, false));
  for (let i = 0; i < 30; i++) s = reducePull(s, wheelUp());
  assert.notEqual(s.phase, "armed");
  assert.equal(pullView(s).ring, false);
  assert.equal(reducePull(s, { type: "wheelIdle" }).phase, "idle");
});

test("trackpad: scrolling back down cancels the pull", () => {
  let s = reducePull(IDLE, wheelUp(true));
  for (let i = 0; i < 30; i++) s = reducePull(s, wheelUp());
  s = reducePull(s, { type: "wheel", deltaY: 30, ready: true, atTop: true, fresh: false });
  assert.equal(s.phase, "idle");
  assert.equal(reducePull(s, { type: "wheelIdle" }).phase, "idle");
});

test("nothing new starts while it refreshes", () => {
  const busy = run([start(), to(travel(TRIGGER) + 20), { type: "end" }]);
  assert.equal(reducePull(busy, start()).phase, "refreshing");
  assert.equal(reducePull(busy, wheelUp(true)).phase, "refreshing");
});
