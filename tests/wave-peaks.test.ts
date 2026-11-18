import assert from "node:assert/strict";
import { test } from "node:test";
import { peaks } from "../src/lib/analyze";

const SLICES = 180;
const PER_SLICE = 1000;

/** A file of 180 equal slices; `fill` gives each slice's samples. */
function file(fill: (slice: number, i: number) => number) {
  const x = new Float32Array(SLICES * PER_SLICE);
  for (let s = 0; s < SLICES; s++) for (let i = 0; i < PER_SLICE; i++) x[s * PER_SLICE + i] = fill(s, i);
  return x;
}

test("wave: 180 values from 0 to 1, two decimals, the loudest slice at 1", () => {
  const out = peaks(file((s, i) => Math.sin(i / 5) * ((s + 1) / SLICES)));
  assert.equal(out.length, SLICES);
  assert.equal(Math.max(...out), 1);
  assert.equal(out[SLICES - 1], 1);
  for (const v of out) {
    assert.ok(v >= 0 && v <= 1);
    assert.equal(v, Math.round(v * 100) / 100);
  }
  // Twice the level draws twice as tall.
  assert.equal(out[89], 0.5);
});

test("wave: a slice is measured by its average level, so one loud click doesn't draw as a full bar", () => {
  // Slice 0: a steady tone at half level. Slice 1: silence with a single full-scale click.
  const out = peaks(file((s, i) => (s === 0 ? (i % 2 ? 0.5 : -0.5) : s === 1 && i === 0 ? 1 : 0)));
  assert.equal(out[0], 1);
  assert.ok(out[1] < 0.1, `a click in silence drew at ${out[1]}`);
});

test("wave: loud sections keep their shape instead of drawing as one flat block", () => {
  // Every slice touches full scale once (a kick), over a bed that grows through the file.
  const out = peaks(file((s, i) => (i === 0 ? 1 : (i % 2 ? 1 : -1) * 0.2 * (1 + s / SLICES))));
  assert.ok(out[0] < 0.6, `the quiet start drew at ${out[0]}`);
  assert.equal(out[SLICES - 1], 1);
  assert.ok(new Set(out).size > 20);
});

test("wave: silence and an empty file give all zeros, never NaN", () => {
  assert.deepEqual(peaks(new Float32Array(SLICES * 10)), Array(SLICES).fill(0));
  assert.deepEqual(peaks(new Float32Array(0)), Array(SLICES).fill(0));
});
