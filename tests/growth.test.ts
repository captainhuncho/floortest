import { test } from "node:test";
import assert from "node:assert/strict";
import { biggestDrop, decisions, forecast, funnel } from "../src/lib/growth";

test("forecast follows a straight trend and widens its range further out", () => {
  const p = forecast([10, 12, 14, 16, 18, 20], 3);
  assert.deepEqual(p.map((x) => x.value), [22, 24, 26]);
  assert.ok(p[0].low <= p[0].value && p[0].high >= p[0].value);
  const noisy = forecast([10, 20, 9, 22, 11, 21], 3);
  assert.ok(noisy[2].high - noisy[2].low >= noisy[0].high - noisy[0].low, "the range grows with distance");
  assert.deepEqual(forecast([5, 6]), [], "too few weeks to project");
  assert.ok(forecast([9, 5, 2, 0, 0], 4).every((x) => x.value >= 0 && x.low >= 0), "never below zero");
});

test("funnel shares and the biggest drop", () => {
  const f = funnel([
    { label: "Joined", n: 100 },
    { label: "Got a track", n: 80 },
    { label: "Kept one", n: 20 },
    { label: "Paid", n: 10 },
  ]);
  assert.deepEqual(f.map((s) => s.ofFirst), [100, 80, 20, 10]);
  assert.deepEqual(f.map((s) => s.ofPrev), [100, 80, 25, 50]);
  assert.equal(biggestDrop(f)?.label, "Kept one");
  assert.equal(biggestDrop(funnel([{ label: "A", n: 0 }])), null);
});

test("decisions say what they saw, ignore tiny groups and stay quiet without data", () => {
  const steps = funnel([
    { label: "Joined", n: 50 },
    { label: "Got a track", n: 10 },
  ]);
  const cards = decisions({
    steps,
    sources: [
      { name: "instagram", people: 20, activated: 15, paid: 6 },
      { name: "lucky", people: 1, activated: 1, paid: 1 },
    ],
    kinds: [
      { name: "Curators", people: 10, activated: 8, paid: 4 },
      { name: "DJs", people: 20, activated: 10, paid: 2 },
    ],
    signups: [10, 10, 4, 4],
    next: [{ value: 5, low: 2, high: 8 }],
  });
  const titles = cards.map((c) => c.title);
  assert.ok(titles.some((t) => t.startsWith("Biggest drop")));
  assert.ok(titles.includes("Curators accounts pay most often"));
  assert.ok(titles.includes("Best source: instagram"), "the one-person group can't win");
  assert.ok(titles.includes("Sign-ups are slowing"));
  assert.deepEqual(decisions({ steps: [], sources: [], kinds: [], signups: [], next: [] }), []);
});
