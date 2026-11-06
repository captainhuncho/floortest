import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// scripts/copy-to-neon.ts runs under plain `npx tsx` (see its header), without the react-server condition the app and
// tests use, so nothing it imports may pull in "server-only" (Safety review of #459). Each of its own modules is loaded
// here exactly that way, in a fresh process.
test("copy-to-neon's own modules load without the server build", () => {
  const src = fs.readFileSync("scripts/copy-to-neon.ts", "utf8");
  const local = [...src.matchAll(/from "(\.\.\/src\/[^"]+)"/g)].map((m) => m[1].replace(/^\.\.\//, "./") + ".ts");
  assert.ok(local.includes("./src/lib/stamp-triggers.ts"), "it uses the shared trigger list");
  for (const file of local) {
    const run = spawnSync("npx", ["tsx", "-e", `import(${JSON.stringify(file)}).then(() => process.exit(0), (e) => { console.error(e?.message ?? e); process.exit(1); })`], { encoding: "utf8" });
    assert.equal(run.status, 0, `${file} loads without react-server: ${run.stderr.slice(0, 300)}`);
  }
});
