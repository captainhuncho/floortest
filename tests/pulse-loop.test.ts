import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { IDLE_STOP_MS, pulseDelay, pulseLoop } from "../src/lib/pulse-loop";

// An open page's change checks (LivePulse) slow down while nothing changes and stop after 5 idle minutes, so a tab left
// open no longer keeps the database awake (17 Nov). Fake timers: no real waiting.
const flush = () => new Promise((done) => setImmediate(done));

function harness(base: number, changes: () => boolean = () => false) {
  const at: number[] = [];
  const loop = pulseLoop(async () => {
    at.push(Date.now());
    return changes();
  }, base);
  return { at, loop };
}

async function advance(ms: number, step = 1_000) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    await flush();
  }
}

test("the wait grows while nothing changes: base, then 30 s after 3, then 60 s after 6", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map((n) => pulseDelay(10_000, n)), [10_000, 10_000, 10_000, 30_000, 30_000, 30_000, 60_000, 60_000]);
  assert.deepEqual([0, 2, 3, 6].map((n) => pulseDelay(8_000, n)), [8_000, 8_000, 30_000, 60_000], "receipt page");
});

test("a desk left alone backs off, then stops after 5 minutes with no input", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  try {
    const { at, loop } = harness(10_000);
    loop.start();
    await flush();
    await advance(IDLE_STOP_MS + 10 * 60_000);
    // 3 checks at base (0, 10, 20 s), 3 at 30 s (50, 80, 110 s), then 60 s steps; nothing after the 5-minute mark.
    assert.deepEqual(at, [0, 10_000, 20_000, 50_000, 80_000, 110_000, 170_000, 230_000, 290_000]);
    loop.stop();
  } finally {
    mock.timers.reset();
  }
});

test("input after the stop checks straight away and starts again at full speed", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  try {
    const { at, loop } = harness(10_000);
    loop.start();
    await flush();
    await advance(IDLE_STOP_MS + 60_000);
    const before = at.length;
    loop.input();
    await flush();
    assert.equal(at.length, before + 1, "checked at once");
    await advance(10_000);
    assert.equal(at.length, before + 2, "next one at the base pace");
    loop.stop();
  } finally {
    mock.timers.reset();
  }
});

test("a change, or input during a slow-down, goes back to the base pace", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  try {
    let changed = false;
    const { at, loop } = harness(8_000, () => changed);
    loop.start();
    await flush();
    await advance(60_000);
    // Slowed down to 30 s after 3 unchanged checks (0, 8, 16 s, then 46 s).
    assert.deepEqual(at, [0, 8_000, 16_000, 46_000]);
    loop.input();
    await advance(8_000);
    assert.equal(at.at(-1), 68_000, "input brought back the 8 s pace");
    changed = true;
    await advance(8_000);
    changed = false;
    await advance(8_000);
    assert.equal(at.at(-1)! - at.at(-2)!, 8_000, "a change keeps the 8 s pace");
    loop.stop();
  } finally {
    mock.timers.reset();
  }
});

test("constant input never delays the next check, and stop ends it", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  try {
    const { at, loop } = harness(10_000);
    loop.start();
    await flush();
    for (let i = 0; i < 25; i++) {
      loop.input();
      await advance(1_000);
    }
    assert.deepEqual(at, [0, 10_000, 20_000], "scrolling at full speed doesn't push the timer back");
    loop.stop();
    await advance(60_000);
    assert.equal(at.length, 3);
  } finally {
    mock.timers.reset();
  }
});

test("wake (tab back in view) checks now and resets the pace", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  try {
    const { at, loop } = harness(10_000);
    loop.start();
    await flush();
    await advance(100_000);
    loop.wake();
    await flush();
    assert.equal(at.at(-1), 100_000);
    await advance(10_000);
    assert.equal(at.at(-1), 110_000);
    loop.stop();
  } finally {
    mock.timers.reset();
  }
});
