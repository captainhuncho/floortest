import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

process.env.DATA_DIR = testDataDir("ft-callout-card-fonts-");

// Its own file, so node:test gives it a cold process with no fonts opened yet.
test("a string needing many fonts stops at the cap without reading them", async () => {
  const { layoutText } = await import("../src/lib/callout-card/shape");
  const reads = new Set<string>();
  const real = fs.readFileSync;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: []) => {
    if (typeof file === "string" && /\.(ttf|otf)$/.test(file)) reads.add(path.basename(file));
    return real(file, ...rest);
  }) as typeof fs.readFileSync;
  try {
    const house = path.join(process.cwd(), "src/lib/callout-card/fonts/instrument-serif-italic-latin.ttf");
    assert.equal(await layoutText("ب!ע!ก!ব!த!क!漢!", { house, size: 40, width: 400 }), null);
  } finally {
    fs.readFileSync = real;
  }
  assert.ok(reads.size <= 3, `read ${[...reads].join(", ")}`);
});
