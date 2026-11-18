import { test } from "node:test";
import assert from "node:assert/strict";
import { barHeights } from "../src/app/dashboard/analytics/Chart";

test("a keep on a day with no arrivals still gets a lime bar", () => {
  // A keep counts on the day it was decided, so a day can have kept 1 and in 0 (seen in the #599 renders, 6 Nov).
  const h = barHeights({ in: 0, kept: 1 }, 2);
  assert.equal(h.in, 0);
  assert.equal(h.kept, 50);
});

test("tracks in and kept are each drawn to the same scale", () => {
  assert.deepEqual(barHeights({ in: 4, kept: 1 }, 4), { in: 100, kept: 25 });
});

test("an empty span never divides by zero", () => {
  assert.deepEqual(barHeights({ in: 0, kept: 0 }, 0), { in: 0, kept: 0 });
});
